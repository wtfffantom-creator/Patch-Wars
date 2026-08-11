require("dotenv").config();

const { Bot, InlineKeyboard } = require("grammy");
const draft = require("./draft");
const { teamCommand } = require("./team");
const match = require("./match");


// ==========================================
// BOT CONFIG
// ==========================================

const TOKEN = process.env.BOT_TOKEN;

if (!TOKEN) {
    console.error("❌ BOT_TOKEN is missing!");
    process.exit(1);
}

const bot = new Bot(TOKEN);


// ==========================================
// TEMPORARY GAME STORAGE
// ==========================================

// No database.
// Games are stored only while the bot is running.

const games = new Map();


// ==========================================
// HTML ESCAPE
// ==========================================

function escapeHTML(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}


// ==========================================
// /START
// ==========================================

bot.command("start", async (ctx) => {

    const keyboard = new InlineKeyboard()
        .text("🏏 PLAY PITCH WARS", "play_pitch_wars");

    await ctx.reply(

        "🏏 <b>PITCH WARS</b>\n\n" +

        "Welcome to Pitch Wars — a 1v1 cricket battle!\n\n" +

        "Build your own XI through the draft, " +
        "face another player, and see who comes out on top.\n\n" +

        "⚔️ 1v1 Matches\n" +
        "📝 Build Your XI\n" +
        "🏏 Multiple Over Formats\n" +
        "🏆 Match Results\n\n" +

        "<b>Ready to play?</b>",

        {
            parse_mode: "HTML",
            reply_markup: keyboard
        }
    );
});


// ==========================================
// START BUTTON
// ==========================================

bot.callbackQuery("play_pitch_wars", async (ctx) => {

    await ctx.answerCallbackQuery();

    await ctx.reply(

        "🏏 <b>PITCH WARS</b>\n\n" +

        "To start a match, use <code>/play</code> " +
        "inside a group chat.",

        {
            parse_mode: "HTML",

            reply_markup: {
                inline_keyboard: [

                    [
                        {
                            text: "🎮 Playzone",
                            url: "https://t.me/+0FhVKsVupJw5YzY1"
                        }
                    ],

                    [
                        {
                            text: "📢 Updates",
                            url: "https://t.me/legacycricketupdates"
                        },
                        {
                            text: "🤖 Bots Channel",
                            url: "https://t.me/codeeholic"
                        }
                    ]

                ]
            }
        }
    );
});


// ==========================================
// /PLAY
// ==========================================

bot.command("play", async (ctx) => {

    // Only groups
    if (
        ctx.chat.type !== "group" &&
        ctx.chat.type !== "supergroup"
    ) {

        await ctx.reply(
            "❌ <b>Pitch Wars matches can only be started in a group chat.</b>",
            {
                parse_mode: "HTML"
            }
        );

        return;
    }


    const chatId = ctx.chat.id;


    // Check active game
    if (games.has(chatId)) {

        await ctx.reply(

            "⚠️ <b>A Pitch Wars game is already active in this group.</b>\n\n" +
            "Finish the current game before starting another one.",

            {
                parse_mode: "HTML"
            }
        );

        return;
    }


    // Create game
    games.set(chatId, {
        players: [],
        status: "waiting",
        messageId: null
    });


    const keyboard = new InlineKeyboard()
        .text("🟢 JOIN", "pitch_join");


    const message = await ctx.reply(

        "🏏 <b>PITCH WARS</b>\n" +
        "━━━━━━━━━━━━━━━━━━\n\n" +

        "⚔️ <b>1v1 CRICKET BATTLE</b>\n\n" +

        "Build your XI.\n" +
        "Draft your players.\n" +
        "Take on another captain.\n\n" +

        "👥 Players: <b>0/2</b>\n\n" +

        "Click <b>JOIN</b> to enter the match.",

        {
            parse_mode: "HTML",
            reply_markup: keyboard
        }
    );


    games.get(chatId).messageId =
        message.message_id;
});


// ==========================================
// JOIN BUTTON
// ==========================================

bot.callbackQuery("pitch_join", async (ctx) => {

    const chatId = ctx.chat.id;

    const game = games.get(chatId);


    // No game
    if (!game) {

        await ctx.answerCallbackQuery({
            text: "❌ This game has expired.",
            show_alert: true
        });

        return;
    }


    // Game full
    if (game.players.length >= 2) {

        await ctx.answerCallbackQuery({
            text: "❌ This match is already full!",
            show_alert: true
        });

        return;
    }


    const user = ctx.from;


    // Already joined
    const alreadyJoined = game.players.some(
        player => player.id === user.id
    );


    if (alreadyJoined) {

        await ctx.answerCallbackQuery({
            text: "⚠️ You already joined this match!",
            show_alert: true
        });

        return;
    }


    // Add captain
    game.players.push({
        id: user.id,
        name: user.first_name || user.username || "Player",
        username: user.username || null
    });


    // ==========================================
    // FIRST PLAYER
    // ==========================================

    if (game.players.length === 1) {

        const player = game.players[0];

        const keyboard = new InlineKeyboard()
            .text("🟢 JOIN", "pitch_join");


        await ctx.api.editMessageText(

            chatId,
            game.messageId,

            "🏏 <b>PITCH WARS</b>\n" +
            "━━━━━━━━━━━━━━━━━━\n\n" +

            "⚔️ <b>1v1 CRICKET BATTLE</b>\n\n" +

            "👥 Players: <b>1/2</b>\n\n" +

            `🟢 <b>${escapeHTML(player.name)}</b> has joined!\n\n` +

            "⏳ Waiting for one more captain...",

            {
                parse_mode: "HTML",
                reply_markup: keyboard
            }
        );


        await ctx.answerCallbackQuery(
            "✅ You joined Pitch Wars!"
        );

        return;
    }


    // ==========================================
    // SECOND PLAYER
    // ==========================================

    if (game.players.length === 2) {

        game.status = "drafting";


        const player1 = game.players[0];
        const player2 = game.players[1];


        // Start draft system
        draft.startDraft(
            chatId,
            game.players.map(player => player.id)
        );


        await ctx.api.editMessageText(

            chatId,
            game.messageId,

            "🏏 <b>PITCH WARS</b>\n" +
            "━━━━━━━━━━━━━━━━━━\n\n" +

            "⚔️ <b>MATCH FOUND!</b>\n\n" +

            `👤 <b>Captain 1:</b> ${escapeHTML(player1.name)}\n` +
            `👤 <b>Captain 2:</b> ${escapeHTML(player2.name)}\n\n` +

            "✅ Both captains have joined!\n\n" +

            "📝 <b>Next Step</b>\n" +
            "Both captains must build their XI.\n\n" +

            "Use <code>/draft</code> to begin.",

            {
                parse_mode: "HTML"
            }
        );


        await ctx.answerCallbackQuery(
            "🔥 Match found!"
        );

        return;
    }
});


// ==========================================
// /DRAFT
// ==========================================

bot.command("draft", async (ctx) => {

    // Only groups
    if (
        ctx.chat.type !== "group" &&
        ctx.chat.type !== "supergroup"
    ) {

        await ctx.reply(
            "❌ <b>Drafting is only available inside a group chat.</b>",
            {
                parse_mode: "HTML"
            }
        );

        return;
    }


    const chatId = ctx.chat.id;

    const game = games.get(chatId);


    // No game
    if (!game) {

        await ctx.reply(

            "❌ <b>No active Pitch Wars game.</b>\n\n" +
            "Start one using <code>/play</code>.",

            {
                parse_mode: "HTML"
            }
        );

        return;
    }


    // Need 2 players
    if (game.players.length < 2) {

        await ctx.reply(

            "⏳ <b>Waiting for the second captain to join.</b>",

            {
                parse_mode: "HTML"
            }
        );

        return;
    }


    const userId = ctx.from.id;


    // Check captain
    const captain = game.players.find(
        player => player.id === userId
    );


    if (!captain) {

        await ctx.reply(

            "❌ <b>You are not one of the captains in this match.</b>",

            {
                parse_mode: "HTML"
            }
        );

        return;
    }


    // Start / initialize draft
    draft.startDraft(
        chatId,
        game.players.map(player => player.id)
    );


    // Open actual player selection
    await draft.openDraft(ctx);
});

// ==========================================
// /TEAM
// ==========================================

bot.command("team", async (ctx) => {
    await teamCommand(ctx);
});


// ==========================================
// DRAFT CALLBACKS
// ==========================================
//
// All callback buttons created by draft.js
// come through here.

bot.on("callback_query:data", async (ctx) => {

    const data = ctx.callbackQuery.data;

    if (data.startsWith("match_")) {
        await match.handleMatchCallback(ctx);
        return;
    }

    if (data.startsWith("draft_")) {
        await draft.handleDraftCallback(ctx);
        return;
    }
});

// ==========================================
// UNKNOWN COMMAND MESSAGE
// ==========================================

bot.command("help", async (ctx) => {

    await ctx.reply(

        "🏏 <b>PITCH WARS HELP</b>\n" +
        "━━━━━━━━━━━━━━━━━━\n\n" +

        "<code>/start</code> — Open Pitch Wars\n" +
        "<code>/play</code> — Start a 1v1 match\n" +
        "<code>/draft</code> — Open player draft\n\n" +

        "⚔️ Build your XI and battle another captain!",

        {
            parse_mode: "HTML"
        }
    );
});


// ==========================================
// ERROR HANDLER
// ==========================================

bot.catch((error) => {

    console.error(
        "❌ BOT ERROR:",
        error.error
    );

});


// ==========================================
// START BOT
// ==========================================

bot.start();

console.log("");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🏏 PITCH WARS");
console.log("🤖 Bot Started Successfully!");
console.log("📝 Draft System Connected!");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("");