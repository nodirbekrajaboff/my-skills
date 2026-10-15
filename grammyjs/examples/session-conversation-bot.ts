import { Bot, Context, session, type SessionFlavor } from "grammy";
import {
  conversations,
  createConversation,
  type ConversationFlavor,
  type Conversation,
} from "@grammyjs/conversations";

// 1. Define Session State
interface SessionData {
  surveyCompleted: boolean;
  score: number;
}

// 2. Define Context Flavor
export type MyContext = Context & SessionFlavor<SessionData> & ConversationFlavor;
export type MyConversation = Conversation<MyContext>;

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is required!");

export const bot = new Bot<MyContext>(token);

// 3. Define Linear Multi-step Conversation
async function feedbackConversation(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply("📋 Let's begin the quick survey!\nWhat is your name?");
  
  // Wait for user's name
  const nameCtx = await conversation.waitFor("message:text");
  const name = nameCtx.msg.text;

  await ctx.reply(`Nice to meet you, ${name}! On a scale of 1 to 5, how would you rate our bot?`);
  
  // Keep asking until a valid number 1-5 is received
  let rating = 0;
  while (true) {
    const ratingCtx = await conversation.waitFor("message:text");
    const num = parseInt(ratingCtx.msg.text, 10);
    if (!isNaN(num) && num >= 1 && num <= 5) {
      rating = num;
      break;
    }
    await ctx.reply("⚠️ Please enter a single number between 1 and 5:");
  }

  // Persist externally using conversation.external()
  await conversation.external(async () => {
    console.log(`[DB SAVE] Survey from ${name} (${ctx.from?.id}): Rating ${rating}/5`);
  });

  // Mutate session data safely
  ctx.session.surveyCompleted = true;
  ctx.session.score = rating;

  await ctx.reply(`🎉 Thank you, ${name}! Your rating of ${rating}/5 has been recorded.`);
}

// 4. Install Middlewares in EXACT order:
// First session:
bot.use(
  session({
    initial: (): SessionData => ({
      surveyCompleted: false,
      score: 0,
    }),
  })
);

// Then conversations plugin:
bot.use(conversations());

// Then register conversation functions:
bot.use(createConversation(feedbackConversation));

// 5. Commands
bot.command("feedback", async (ctx) => {
  if (ctx.session.surveyCompleted) {
    await ctx.reply(`You already completed the survey with a rating of ${ctx.session.score}/5!`);
    return;
  }
  await ctx.conversation.enter("feedbackConversation");
});

bot.command("status", async (ctx) => {
  await ctx.reply(
    `Status:\nSurvey Done: ${ctx.session.surveyCompleted ? "Yes" : "No"}\nScore: ${ctx.session.score}`
  );
});

bot.start();
