import {
  Bot,
  Context,
  MemorySessionStorage,
  session,
  type SessionFlavor,
} from "grammy";
import {
  type Conversation,
  type ConversationData,
  type ConversationFlavor,
  conversations,
  createConversation,
  type VersionedState,
} from "@grammyjs/conversations";

// 1. Define Session State
interface SessionData {
  surveyCompleted: boolean;
  score: number;
}

// 2. Define Outside Context vs. Inside Conversation Context (Conversations 2.0)
export type MyContext = ConversationFlavor<Context & SessionFlavor<SessionData>>;
export type MyConversationContext = Context;
export type MyConversation = Conversation<MyContext, MyConversationContext>;

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is required!");

export const bot = new Bot<MyContext>(token);

// 3. Define Multi-step Conversation (Conversations 2.0)
async function feedbackConversation(
  conversation: MyConversation,
  ctx: MyConversationContext,
) {
  await ctx.reply("📋 Let's begin the quick survey!\nWhat is your name?");

  // Use built-in form validator for text:
  const name = await conversation.form.text({
    otherwise: (ctx) => ctx.reply("⚠️ Please send your name as a text message!"),
  });

  await ctx.reply(
    `Nice to meet you, ${name}! On a scale of 1 to 5, how would you rate our bot?`,
  );

  // Use built-in form validator for bounded integers:
  const rating = await conversation.form.int({
    minimum: 1,
    maximum: 5,
    otherwise: (ctx) => ctx.reply("⚠️ Please enter a whole number between 1 and 5:"),
  });

  // Persist external side effects & update outside session via conversation.external()
  await conversation.external(async (outsideCtx) => {
    console.log(`[DB SAVE] Survey from ${name} (${outsideCtx.from?.id}): Rating ${rating}/5`);
    outsideCtx.session.surveyCompleted = true;
    outsideCtx.session.score = rating;
  });

  await ctx.reply(`🎉 Thank you, ${name}! Your rating of ${rating}/5 has been recorded.`);
}

// 4. Install Session and Conversations 2.0 Plugins
bot.use(
  session({
    initial: (): SessionData => ({
      surveyCompleted: false,
      score: 0,
    }),
  }),
);

bot.use(
  conversations({
    storage: {
      type: "key",
      version: 1,
      adapter: new MemorySessionStorage<VersionedState<ConversationData>>(),
    },
  }),
);

// Allow users to cancel the active conversation at any point
bot.command("cancel", async (ctx) => {
  await ctx.conversation.exit("feedbackConversation");
  await ctx.reply("❌ Survey cancelled.");
});

// Register the conversation handler
bot.use(createConversation(feedbackConversation));

// 5. Commands
bot.command("feedback", async (ctx) => {
  if (ctx.session.surveyCompleted) {
    await ctx.reply(
      `You already completed the survey with a rating of ${ctx.session.score}/5!`,
    );
    return;
  }
  await ctx.conversation.enter("feedbackConversation");
});

bot.command("status", async (ctx) => {
  const activeCount = await ctx.conversation.active("feedbackConversation");
  await ctx.reply(
    `Status:\nSurvey Done: ${ctx.session.surveyCompleted ? "Yes" : "No"}\nScore: ${ctx.session.score}\nIn Progress: ${activeCount > 0 ? "Yes" : "No"}`,
  );
});

bot.start();
