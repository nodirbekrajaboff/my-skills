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
  }),
);

const LANGUAGES = [
  { code: "en", label: "🇬🇧 English" },
  { code: "es", label: "🇪🇸 Español" },
  { code: "de", label: "🇩🇪 Deutsch" },
];

// 1. Language Submenu using .dynamic() and button payloads
const languageMenu = new Menu<MyContext>("language-menu")
  .dynamic((ctx, range) => {
    for (const lang of LANGUAGES) {
      const isSelected = ctx.session.language === lang.code;
      range.text(
        {
          text: isSelected ? `${lang.label} ✅` : lang.label,
          payload: lang.code,
        },
        (ctx) => {
          ctx.session.language = ctx.match;
          ctx.menu.update();
        },
      );
    }
  })
  .row()
  .back("⬅️ Back to Settings");

// 2. Settings Root Menu
const settingsMenu = new Menu<MyContext>("settings-menu", {
  onMenuOutdated: "⚙️ Menu was updated, refreshing...",
})
  .text(
    (ctx) => (ctx.session.notifications ? "🔔 Notifications: ON" : "🔕 Notifications: OFF"),
    (ctx) => {
      ctx.session.notifications = !ctx.session.notifications;
      ctx.menu.update();
    },
  )
  .text(
    (ctx) => (ctx.session.sound ? "🔊 Sound: ON" : "🔇 Sound: OFF"),
    (ctx) => {
      ctx.session.sound = !ctx.session.sound;
      ctx.menu.update();
    },
  )
  .row()
  .submenu("🌐 Select Language", "language-menu")
  .row()
  .text("❌ Close Menu", (ctx) => ctx.menu.close());

// 3. Register submenu hierarchy and mount root menu BEFORE command handlers
settingsMenu.register(languageMenu);
bot.use(settingsMenu);

bot.command("settings", async (ctx) => {
  await ctx.reply("⚙️ Bot Settings Menu:", {
    reply_markup: settingsMenu,
  });
});

bot.start();
