import { Bot, Context, session, type SessionFlavor } from "grammy";
import { Menu } from "@grammyjs/menu";

interface SessionData {
  notifications: boolean;
  sound: boolean;
  language: string;
}

export type MyContext = Context & SessionFlavor<SessionData>;

const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

bot.use(
  session({
    initial: (): SessionData => ({
      notifications: true,
      sound: true,
      language: "en",
    }),
  })
);

// 1. Language Submenu
const languageMenu = new Menu<MyContext>("language-menu")
  .text(
    (ctx) => (ctx.session.language === "en" ? "🇬🇧 English ✅" : "🇬🇧 English"),
    (ctx) => {
      ctx.session.language = "en";
      ctx.menu.update();
    }
  )
  .text(
    (ctx) => (ctx.session.language === "es" ? "🇪🇸 Español ✅" : "🇪🇸 Español"),
    (ctx) => {
      ctx.session.language = "es";
      ctx.menu.update();
    }
  )
  .row()
  .back("⬅️ Back to Settings");

// 2. Settings Root Menu
const settingsMenu = new Menu<MyContext>("settings-menu")
  .text(
    (ctx) => (ctx.session.notifications ? "🔔 Notifications: ON" : "🔕 Notifications: OFF"),
    (ctx) => {
      ctx.session.notifications = !ctx.session.notifications;
      ctx.menu.update();
    }
  )
  .text(
    (ctx) => (ctx.session.sound ? "🔊 Sound: ON" : "🔇 Sound: OFF"),
    (ctx) => {
      ctx.session.sound = !ctx.session.sound;
      ctx.menu.update();
    }
  )
  .row()
  .submenu("🌐 Select Language", "language-menu")
  .row()
  .text("❌ Close Menu", (ctx) => ctx.deleteMessage());

// 3. Register menu hierarchy and mount onto bot
settingsMenu.register(languageMenu);
bot.use(settingsMenu);

bot.command("settings", async (ctx) => {
  await ctx.reply("⚙️ Bot Settings Menu:", {
    reply_markup: settingsMenu,
  });
});

bot.start();
