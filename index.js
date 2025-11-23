const { Telegraf, Markup } = require("telegraf");
require("dotenv").config();

// Конфигурация
const BOT_TOKEN = process.env.BOT_TOKEN || "your_bot_token_here";
const ADMIN_IDS = (process.env.ADMIN_IDS || "123456789")
  .split(",")
  .map((id) => parseInt(id.trim()))
  .filter((id) => !isNaN(id));

const CHAT_USERNAMES = (process.env.CHAT_USERNAMES || "my_public_chat")
  .split(",")
  .map((name) => name.trim())
  .filter((name) => name.length > 0);

// Проверка конфигурации
if (!BOT_TOKEN || BOT_TOKEN === "your_bot_token_here") {
  console.error("❌ ERROR: Укажите BOT_TOKEN в файле .env");
  process.exit(1);
}

if (ADMIN_IDS.length === 0 || ADMIN_IDS[0] === 123456789) {
  console.error("❌ ERROR: Укажите ADMIN_IDS в файле .env");
  process.exit(1);
}

if (CHAT_USERNAMES.length === 0 || CHAT_USERNAMES[0] === "my_public_chat") {
  console.error("❌ ERROR: Укажите CHAT_USERNAMES в файле .env");
  process.exit(1);
}

// Хранилище в памяти
const pendingUsers = new Map();
const approvedUsers = new Set();

class MathCaptchaBot {
  constructor() {
    this.bot = new Telegraf(BOT_TOKEN);
    this.setupHandlers();
  }

  setupHandlers() {
    // Обработчик новых участников
    this.bot.on("new_chat_members", (ctx) => this.handleNewMembers(ctx));

    // Обработчик текстовых сообщений
    this.bot.on("text", (ctx) => this.handleTextMessage(ctx));

    // Обработчик callback-кнопок
    this.bot.action(/^(approve|ban)_([^_]+)_(\d+)$/, (ctx) =>
      this.handleAdminDecision(ctx)
    );
    this.bot.action(/^help_([^_]+)_(\d+)$/, (ctx) =>
      this.handleHelpRequest(ctx)
    );

    // Команды для администраторов
    this.bot.command("start", (ctx) => this.startCommand(ctx));
    this.bot.command("stats", (ctx) => this.statsCommand(ctx));
    this.bot.command("pending", (ctx) => this.pendingCommand(ctx));
    this.bot.command("clean", (ctx) => this.cleanCommand(ctx));
    this.bot.command("help", (ctx) => this.helpCommand(ctx));
    this.bot.command("chats", (ctx) => this.chatsCommand(ctx));

    // Обработчик ошибок
    this.bot.catch((err, ctx) => {
      console.error("❌ Ошибка бота:", err);
    });
  }

  // Проверка, что чат в списке отслеживаемых
  isTargetChat(chatUsername) {
    return CHAT_USERNAMES.includes(chatUsername);
  }

  generateMathProblem() {
    const operations = ["+", "-", "*"];
    const operation = operations[Math.floor(Math.random() * operations.length)];

    let a, b, answer;

    switch (operation) {
      case "+":
        a = Math.floor(Math.random() * 10) + 1;
        b = Math.floor(Math.random() * 10) + 1;
        answer = a + b;
        break;
      case "-":
        a = Math.floor(Math.random() * 15) + 5;
        b = Math.floor(Math.random() * 5) + 1;
        answer = a - b;
        break;
      case "*":
        a = Math.floor(Math.random() * 5) + 1;
        b = Math.floor(Math.random() * 5) + 1;
        answer = a * b;
        break;
      default:
        a = 2;
        b = 2;
        answer = 4;
    }

    return {
      problem: `${a} ${operation} ${b} = ?`,
      answer: answer,
      display: `${a} ${operation} ${b}`,
    };
  }

  async handleNewMembers(ctx) {
    try {
      const chat = ctx.chat;

      if (!chat || !chat.username) {
        return;
      }

      if (!this.isTargetChat(chat.username)) {
        console.log(`➡️ Пропущен чат: @${chat.username}`);
        return;
      }

      console.log(`👥 Новые участники в чате: @${chat.username}`);

      for (const member of ctx.message.new_chat_members) {
        if (member.id === ctx.botInfo.id) {
          continue;
        }
        await this.processNewMember(ctx, member, chat);
      }
    } catch (error) {
      console.error("❌ Ошибка обработки новых участников:", error);
    }
  }

  async processNewMember(ctx, member, chat) {
    const userId = member.id;
    const firstName = member.first_name || "Пользователь";
    const username = member.username || "нет username";
    const chatUsername = chat.username;

    console.log(`🔍 Новый пользователь в @${chatUsername}: ${firstName}`);

    if (approvedUsers.has(userId)) {
      return;
    }

    try {
      // Мягкое ограничение прав
      await ctx.restrictChatMember(userId, {
        can_send_messages: true,
        can_send_media_messages: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
      });

      // Генерируем задачу
      const mathProblem = this.generateMathProblem();

      // Сохраняем данные
      pendingUsers.set(userId, {
        username: username,
        first_name: firstName,
        chat_id: chat.id,
        chat_title: chat.title,
        chat_username: chatUsername,
        join_time: Date.now(),
        math_problem: mathProblem.problem,
        math_display: mathProblem.display,
        correct_answer: mathProblem.answer,
        has_attempted: false,
      });

      // Приветственное сообщение
      const welcomeMessage = `👋 *Добро пожаловать в чат Сатирикона, ${firstName}!*

Внимание!!! ⚠️ Работает шлюхобот-детектор 🤖

Чтобы начать щитпост, решите простую математическую задачу:

🔢 **Задача:** ${mathProblem.display}

📝 *Отправьте ответ числом в этот чат*

⏰ *У вас есть 3 минуты и 1 попытка*`;

      await ctx.reply(welcomeMessage, {
        parse_mode: "Markdown",
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback("❌ Я бот", `ban_${chatUsername}_${userId}`)],
        ]),
      });

      console.log(
        `✏️ Задана задача пользователю ${firstName}: ${mathProblem.display}`
      );
    } catch (error) {
      console.error(`❌ Ошибка обработки пользователя ${userId}:`, error);

      // Резервный вариант без ограничения прав
      const mathProblem = this.generateMathProblem();
      pendingUsers.set(userId, {
        username: username,
        first_name: firstName,
        chat_id: chat.id,
        chat_title: chat.title,
        chat_username: chatUsername,
        join_time: Date.now(),
        math_problem: mathProblem.problem,
        math_display: mathProblem.display,
        correct_answer: mathProblem.answer,
        has_attempted: false,
      });

      const errorMessage = `👋 Добро пожаловать, ${firstName}!

Внимание!!! ⚠️ Работает шлюхобот-детектор 🤖

Решите задачу для полного доступа к чату:

🔢 **Задача:** ${mathProblem.display}

📝 Отправьте ответ числом.

⏰ У вас есть 3 минуты и 1 попытка.`;

      await ctx.reply(errorMessage, { parse_mode: "Markdown" });
    }
  }

  async handleTextMessage(ctx) {
    try {
      const userId = ctx.from.id;
      const messageText = ctx.message.text.trim();
      const chat = ctx.chat;

      if (!chat || !chat.username || !this.isTargetChat(chat.username)) {
        return;
      }

      if (!pendingUsers.has(userId)) {
        return;
      }

      const userInfo = pendingUsers.get(userId);

      // Проверяем чат
      if (userInfo.chat_username !== chat.username) {
        return;
      }

      // Проверяем время (3 минуты лимит)
      if (Date.now() - userInfo.join_time > 3 * 60 * 1000) {
        await this.timeoutUser(ctx, userId, userInfo);
        return;
      }

      // Проверяем, не пытался ли уже пользователь
      if (userInfo.has_attempted) {
        await ctx.reply(
          "❌ Вы уже использовали свою попытку. Ожидайте решения администратора."
        );
        return;
      }

      // Проверяем ответ
      const userAnswer = parseInt(messageText);

      if (isNaN(userAnswer)) {
        await ctx.reply(
          "❌ Ответ должен быть числом. Отправьте правильный ответ."
        );
        return;
      }

      // Помечаем, что пользователь уже пытался
      userInfo.has_attempted = true;
      pendingUsers.set(userId, userInfo);

      if (userAnswer === userInfo.correct_answer) {
        await this.approveUser(ctx, userId, userInfo);
      } else {
        await this.failUser(ctx, userId, userInfo, userAnswer);
      }
    } catch (error) {
      console.error("❌ Ошибка обработки сообщения:", error);
    }
  }

  async timeoutUser(ctx, userId, userInfo) {
    await ctx.reply("⏰ Время на решение истекло. Вы были забанены.");
    await this.banUser(ctx, userId, userInfo, "Время на решение истекло");
    await this.notifyAdminsAboutTimeout(userInfo);
  }

  async failUser(ctx, userId, userInfo, userAnswer) {
    await ctx.reply("❌ Неправильный ответ. Вы были забанены.");
    await this.banUser(
      ctx,
      userId,
      userInfo,
      `Неправильный ответ: ${userAnswer}`
    );
    await this.notifyAdminsAboutFailure(userInfo, userAnswer);
  }

  async approveUser(ctx, userId, userInfo) {
    try {
      // Даем полные права
      await ctx.telegram.restrictChatMember(userInfo.chat_id, userId, {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
      });

      approvedUsers.add(userId);
      pendingUsers.delete(userId);

      await ctx.reply(
        `✅ Правильно! Добро пожаловать в чат, ${userInfo.first_name}! 🎉\n\nПриятного щитпоста!`
      );
      console.log(`✅ Пользователь ${userInfo.first_name} прошел проверку`);

      await this.notifyAdminsAboutSuccess(userInfo);
    } catch (error) {
      console.error(`❌ Ошибка при одобрении пользователя ${userId}:`, error);
    }
  }

  async banUser(ctx, userId, userInfo, reason) {
    try {
      await ctx.banChatMember(userId);
      pendingUsers.delete(userId);
      console.log(`❌ Пользователь ${userId} заблокирован. Причина: ${reason}`);
    } catch (error) {
      console.error(`❌ Ошибка при блокировке пользователя ${userId}:`, error);
    }
  }

  async handleHelpRequest(ctx) {
    try {
      await ctx.answerCbQuery();

      const chatUsername = ctx.match[1];
      const userId = parseInt(ctx.match[2]);

      const userInfo = pendingUsers.get(userId);
      if (userInfo) {
        await ctx.editMessageText(
          `🆘 *Помощь для ${userInfo.first_name}*\n\n` +
            `**Задача:** ${userInfo.math_display}\n\n` +
            `*Инструкция:*\n` +
            `1. Посчитайте результат\n` +
            `2. Отправьте ответ числом в чат\n` +
            `3. У вас одна попытка\n` +
            `4. На решение 3 минуты\n\n` +
            `*Пример:* Если задача "5 + 3", отправьте "8"`,
          { parse_mode: "Markdown" }
        );
      }
    } catch (error) {
      console.error("❌ Ошибка обработки помощи:", error);
    }
  }

  // Уведомления для администраторов
  async notifyAdminsAboutSuccess(userInfo) {
    const message = `✅ **Пользователь прошел проверку**

💬 Чат: @${userInfo.chat_username}
👤 Пользователь: ${userInfo.first_name}
📧 Username: @${userInfo.username || "нет"}
🆔 ID: \`${userInfo.userId || "N/A"}\`
🔢 Задача: ${userInfo.math_display} = ${userInfo.correct_answer}
⏰ Время: ${Math.round((Date.now() - userInfo.join_time) / 1000)} сек.`;

    await this.sendToAdmins(message);
  }

  async notifyAdminsAboutFailure(userInfo, userAnswer) {
    const message = `❌ **Пользователь не прошел проверку**

💬 Чат: @${userInfo.chat_username}
👤 Пользователь: ${userInfo.first_name}
📧 Username: @${userInfo.username || "нет"}
🆔 ID: \`${userInfo.userId || "N/A"}\`
🔢 Задача: ${userInfo.math_display} = ${userInfo.correct_answer}
❌ Ответ пользователя: ${userAnswer}
⏰ Время: ${Math.round((Date.now() - userInfo.join_time) / 1000)} сек.`;

    await this.sendToAdmins(message, true);
  }

  async notifyAdminsAboutTimeout(userInfo) {
    const message = `⏰ **Время истекло**

💬 Чат: @${userInfo.chat_username}
👤 Пользователь: ${userInfo.first_name}
📧 Username: @${userInfo.username || "нет"}
🆔 ID: \`${userInfo.userId || "N/A"}\`
🔢 Задача: ${userInfo.math_display} = ${userInfo.correct_answer}`;

    await this.sendToAdmins(message, true);
  }

  async sendToAdmins(message, includeButtons = false) {
    for (const adminId of ADMIN_IDS) {
      try {
        const options = {
          parse_mode: "Markdown",
        };

        if (includeButtons) {
          options.reply_markup = Markup.inlineKeyboard([
            [
              Markup.button.callback("📊 Статистика", "show_stats"),
              Markup.button.callback("📋 Ожидают", "show_pending"),
            ],
          ]);
        }

        await this.bot.telegram.sendMessage(adminId, message, options);
      } catch (error) {
        console.error(`❌ Ошибка отправки админу ${adminId}:`, error.message);
      }
    }
  }

  async handleAdminDecision(ctx) {
    try {
      await ctx.answerCbQuery();

      const userId = ctx.from.id;
      if (!ADMIN_IDS.includes(userId)) {
        await ctx.editMessageText("❌ Нет прав");
        return;
      }

      const action = ctx.match[1];
      const chatUsername = ctx.match[2];
      const targetUserId = parseInt(ctx.match[3]);

      if (!pendingUsers.has(targetUserId)) {
        await ctx.editMessageText("❌ Пользователь не найден");
        return;
      }

      const userInfo = pendingUsers.get(targetUserId);

      if (userInfo.chat_username !== chatUsername) {
        await ctx.editMessageText("❌ Неверный чат");
        return;
      }

      if (action === "approve") {
        await this.adminApproveUser(ctx, targetUserId, userInfo);
      } else {
        await this.adminBanUser(ctx, targetUserId, userInfo);
      }
    } catch (error) {
      console.error("❌ Ошибка обработки решения:", error);
      await ctx.answerCbQuery("❌ Ошибка");
    }
  }

  async adminApproveUser(ctx, userId, userInfo) {
    try {
      await ctx.telegram.restrictChatMember(userInfo.chat_id, userId, {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
      });

      approvedUsers.add(userId);
      pendingUsers.delete(userId);

      await ctx.editMessageText(
        `✅ ${userInfo.first_name} одобрен в @${userInfo.chat_username}`
      );

      await this.bot.telegram.sendMessage(
        userInfo.chat_id,
        `✅ ${userInfo.first_name} одобрен администратором! 🎉`
      );
    } catch (error) {
      console.error(`❌ Ошибка одобрения:`, error);
      await ctx.editMessageText("❌ Ошибка одобрения");
    }
  }

  async adminBanUser(ctx, userId, userInfo) {
    try {
      await this.bot.telegram.banChatMember(userInfo.chat_id, userId);
      pendingUsers.delete(userId);
      await ctx.editMessageText(
        `❌ ${userInfo.first_name} заблокирован в @${userInfo.chat_username}`
      );
    } catch (error) {
      console.error(`❌ Ошибка блокировки:`, error);
      await ctx.editMessageText("❌ Ошибка блокировки");
    }
  }

  // Команды для администраторов
  async startCommand(ctx) {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;

    await ctx.reply(
      `🤖 Бот математической проверки\n\n` +
        `📊 Статистика:\n` +
        `⏳ Ожидают: ${pendingUsers.size}\n` +
        `✅ Прошли: ${approvedUsers.size}\n` +
        `👑 Админов: ${ADMIN_IDS.length}\n` +
        `💬 Чатов: ${CHAT_USERNAMES.length}\n\n` +
        `⚡ *1 попытка, 3 минуты*`
    );
  }

  async statsCommand(ctx) {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;

    // Очистка просроченных
    const now = Date.now();
    let expiredCount = 0;

    for (const [userId, userInfo] of pendingUsers.entries()) {
      if (now - userInfo.join_time > 3 * 60 * 1000) {
        pendingUsers.delete(userId);
        expiredCount++;
      }
    }

    const statsText = `📊 **Статистика**

⏳ Ожидают: ${pendingUsers.size}
✅ Прошли: ${approvedUsers.size}
👑 Админов: ${ADMIN_IDS.length}
💬 Чатов: ${CHAT_USERNAMES.length}
🧹 Очищено: ${expiredCount}

**Настройки:**
⏰ Время: 3 минуты
🔢 Попыток: 1
🔧 Задачи: +, -, ×`;

    await ctx.reply(statsText, { parse_mode: "Markdown" });
  }

  async pendingCommand(ctx) {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;

    if (pendingUsers.size === 0) {
      await ctx.reply("✅ Нет пользователей на проверке");
      return;
    }

    let pendingText = "📋 **На проверке:**\n\n";
    let counter = 1;

    for (const [userId, userInfo] of pendingUsers.entries()) {
      const timeLeft = Math.max(
        0,
        10 - Math.round((Date.now() - userInfo.join_time) / 60000)
      );
      const attempted = userInfo.has_attempted ? "✅ Пытался" : "⏳ Ожидает";

      pendingText += `${counter}. **${userInfo.first_name}**\n`;
      pendingText += `   👤 @${userInfo.username || "нет"}\n`;
      pendingText += `   💬 @${userInfo.chat_username}\n`;
      pendingText += `   🔢 ${userInfo.math_display}\n`;
      pendingText += `   📊 ${attempted}\n`;
      pendingText += `   ⏰ ${timeLeft} мин.\n`;
      pendingText += `   ─────────────────\n`;

      counter++;

      if (pendingText.length > 3000) {
        pendingText += "\n... (список обрезан)";
        break;
      }
    }

    await ctx.reply(pendingText, { parse_mode: "Markdown" });
  }

  async cleanCommand(ctx) {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;

    const count = pendingUsers.size;
    pendingUsers.clear();

    await ctx.reply(`🧹 Очищено ${count} записей`);
    console.log(`🧹 Очищено ${count} записей`);
  }

  async chatsCommand(ctx) {
    if (!ADMIN_IDS.includes(ctx.from.id)) return;

    let chatsText = "📋 **Отслеживаемые чаты:**\n\n";
    CHAT_USERNAMES.forEach((chat, index) => {
      chatsText += `${index + 1}. @${chat}\n`;
    });
    chatsText += `\nВсего: ${CHAT_USERNAMES.length}`;

    await ctx.reply(chatsText, { parse_mode: "Markdown" });
  }

  async helpCommand(ctx) {
    const helpText = `🤖 **Бот математической проверки**

*Одна попытка, 3 минуты*

**Для новых пользователей:**
- Решите математическую задачу
- 1 попытка, 3 минуты
- Отправьте ответ числом

**Для администраторов:**
/start - информация
/stats - статистика  
/pending - список
/chats - чаты
/clean - очистка

**Чаты:** ${CHAT_USERNAMES.map((c) => `@${c}`).join(", ")}`;

    await ctx.reply(helpText, { parse_mode: "Markdown" });
  }

  // Очистка старых записей
  startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [userId, userInfo] of pendingUsers.entries()) {
        if (now - userInfo.join_time > 10 * 60 * 1000) {
          pendingUsers.delete(userId);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`🧹 Автоочистка: ${cleaned} записей`);
      }
    }, 5 * 60 * 1000);
  }

  start() {
    this.bot.launch().then(() => {
      console.log("🤖 Бот запущен!");
      console.log(`👑 Админов: ${ADMIN_IDS.length}`);
      console.log(`💬 Чаты: ${CHAT_USERNAMES.join(", ")}`);
      console.log("⚡ Ожидание участников...");
      console.log("⚙️ Настройки: 1 попытка, 3 минуты");
    });

    this.startCleanupInterval();

    // Graceful shutdown
    process.once("SIGINT", () => this.bot.stop("SIGINT"));
    process.once("SIGTERM", () => this.bot.stop("SIGTERM"));
  }
}

// Запуск бота
console.log("🚀 Запуск бота с одной попыткой...");
const mathBot = new MathCaptchaBot();
mathBot.start();
