const players = require("./players");
const match = require("./match");

// ==========================================
// DRAFT STORAGE
// ==========================================

const drafts = new Map();

const MAX_PLAYERS = 11;
const RANDOM_POOL_SIZE = 15;


// ==========================================
// HTML ESCAPE
// ==========================================

function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}


// ==========================================
// RANDOM 15 PLAYERS
// ==========================================

function getRandomPlayers() {

    if (players.length < RANDOM_POOL_SIZE) {
        throw new Error(
            `players.js must contain at least ${RANDOM_POOL_SIZE} players.`
        );
    }

    const shuffled = [...players];

    for (let i = shuffled.length - 1; i > 0; i--) {

        const j =
            Math.floor(Math.random() * (i + 1));

        [shuffled[i], shuffled[j]] =
            [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, RANDOM_POOL_SIZE);
}


// ==========================================
// START DRAFT
// ==========================================

function startDraft(chatId, captainIds) {

    // Don't recreate an active draft
    if (drafts.has(chatId)) {

        const existing =
            drafts.get(chatId);

        const sameCaptains =
            existing.captains.length === captainIds.length &&
            existing.captains.every(
                id => captainIds.includes(id)
            );

        if (sameCaptains) {
            return existing;
        }
    }


    const draft = {

        chatId,

        captains: [...captainIds],

        // Each captain has their own random 15
        pools: {},

        // Each captain's selected XI
        teams: {},

        // Ready status
        ready: new Set(),

        // Message ID for each captain
        // This allows us to edit the SAME message
        messageIds: {},

        status: "drafting",

        overs: null
    };


    // Create separate pools
    for (const captainId of captainIds) {

        draft.pools[captainId] =
            getRandomPlayers();

        draft.teams[captainId] = [];

        draft.messageIds[captainId] = null;
    }


    drafts.set(chatId, draft);

    return draft;
}


// ==========================================
// GET DRAFT
// ==========================================

function getDraft(chatId) {
    return drafts.get(chatId);
}


// ==========================================
// GET PLAYER
// ==========================================

function getPlayer(pool, playerId) {

    return pool.find(
        player =>
            Number(player.id) === Number(playerId)
    );
}


// ==========================================
// PLAYER TEXT
// ==========================================

function getDraftText(ctx, draft, userId) {

    const pool =
        draft.pools[userId];

    const team =
        draft.teams[userId];

    const captainName =
        ctx.from.first_name ||
        ctx.from.username ||
        "Captain";


    let text =
        "📝 <b>PLAYER DRAFT</b>\n" +
        "━━━━━━━━━━━━━━━━━━\n\n" +

        `👤 Captain: <b>${escapeHTML(captainName)}</b>\n\n` +

        `🏏 Your XI: <b>${team.length}/11</b>\n` +

        `🎲 Your Pool: <b>15 Players</b>\n\n` +

        "Select 11 players:\n\n";


    pool.forEach((player, index) => {

        const selected =
            team.some(
                p =>
                    Number(p.id) ===
                    Number(player.id)
            );

        text +=
            `${index + 1}. ` +
            `${escapeHTML(player.name)}` +
            ` — ${escapeHTML(player.role || "Player")}` +
            `${selected ? " ✅" : ""}\n`;
    });


    text +=
        "\n━━━━━━━━━━━━━━━━━━\n" +
        "🎯 Choose your XI from these 15 players.";

    return text;
}


// ==========================================
// DRAFT KEYBOARD
// ==========================================

function getDraftKeyboard(draft, userId) {

    const pool =
        draft.pools[userId];

    const team =
        draft.teams[userId];

    const keyboard = [];


    // Player buttons
    for (const player of pool) {

        const selected =
            team.some(
                p =>
                    Number(p.id) ===
                    Number(player.id)
            );


        keyboard.push([
            {
                text: selected
                    ? `✅ ${player.name}`
                    : `🏏 ${player.name}`,

                callback_data:
                    selected
                        ? `draft_remove_${player.id}`
                        : `draft_pick_${player.id}`
            }
        ]);
    }


    // Bottom buttons
    keyboard.push([
        {
            text:
                `👥 MY XI (${team.length}/11)`,

            callback_data:
                "draft_team"
        },

        {
            text: "✅ READY",

            callback_data:
                "draft_ready"
        }
    ]);


    return keyboard;
}


// ==========================================
// EDIT EXISTING DRAFT MESSAGE
// ==========================================

async function editDraftMessage(
    ctx,
    draft,
    userId
) {

    const messageId =
        draft.messageIds[userId];


    if (!messageId) {
        return false;
    }


    const text =
        getDraftText(
            ctx,
            draft,
            userId
        );


    const keyboard =
        getDraftKeyboard(
            draft,
            userId
        );


    try {

        await ctx.api.editMessageText(

            draft.chatId,

            messageId,

            text,

            {
                parse_mode: "HTML",

                reply_markup: {
                    inline_keyboard:
                        keyboard
                }
            }
        );

        return true;

    } catch (error) {

        console.error(
            "Draft message edit error:",
            error.message
        );

        return false;
    }
}


// ==========================================
// OPEN DRAFT
// ==========================================

async function openDraft(ctx) {

    const chatId =
        ctx.chat.id;

    const userId =
        ctx.from.id;


    const draft =
        drafts.get(chatId);


    if (!draft) {

        await ctx.reply(
            "❌ <b>Draft session not found.</b>\n\n" +
            "Use <code>/draft</code> again.",

            {
                parse_mode: "HTML"
            }
        );

        return;
    }


    // Captain check
    if (!draft.captains.includes(userId)) {

        await ctx.reply(
            "❌ <b>You are not one of the captains.</b>",

            {
                parse_mode: "HTML"
            }
        );

        return;
    }


    // If already has a message,
    // EDIT it instead of creating another one.
    if (draft.messageIds[userId]) {

        const edited =
            await editDraftMessage(
                ctx,
                draft,
                userId
            );

        if (edited) {
            return;
        }
    }


    // First time → create ONE message
    const message =
        await ctx.reply(

            getDraftText(
                ctx,
                draft,
                userId
            ),

            {
                parse_mode: "HTML",

                reply_markup: {
                    inline_keyboard:
                        getDraftKeyboard(
                            draft,
                            userId
                        )
                }
            }
        );


    // Save message ID
    draft.messageIds[userId] =
        message.message_id;
}


// ==========================================
// SHOW PLAYER INFO
// ==========================================

async function showPlayerInfo(
    ctx,
    draft,
    userId,
    playerId
) {

    const pool =
        draft.pools[userId];

    const player =
        getPlayer(
            pool,
            playerId
        );


    if (!player) {

        await ctx.answerCallbackQuery({
            text:
                "❌ Player not found in your pool.",
            show_alert: true
        });

        return;
    }


    const team =
        draft.teams[userId];


    const selected =
        team.some(
            p =>
                Number(p.id) ===
                Number(player.id)
        );


    let text =
        "🏏 <b>PLAYER DETAILS</b>\n" +
        "━━━━━━━━━━━━━━━━━━\n\n" +

        `👤 <b>${escapeHTML(player.name)}</b>\n\n` +

        `🌍 Country: <b>${escapeHTML(
            player.country || "Unknown"
        )}</b>\n` +

        `🎯 Role: <b>${escapeHTML(
            player.role || "Player"
        )}</b>\n`;


    if (player.batting !== undefined) {

        text +=
            `🏏 Batting: <b>${player.batting}</b>\n`;
    }


    if (player.bowling !== undefined) {

        text +=
            `🎳 Bowling: <b>${player.bowling}</b>\n`;
    }


    if (player.overall !== undefined) {

        text +=
            `⭐ Overall: <b>${player.overall}</b>\n`;
    }


    text +=
        "\n━━━━━━━━━━━━━━━━━━\n";


    if (selected) {

        text +=
            "✅ This player is in your XI.";

    } else {

        text +=
            "🎯 This player is available.";
    }


    await ctx.answerCallbackQuery();


    const keyboard = {

        inline_keyboard: [

            [
                {
                    text:
                        selected
                            ? "❌ REMOVE PLAYER"
                            : "🏏 SELECT PLAYER",

                    callback_data:
                        selected
                            ? `draft_remove_${player.id}`
                            : `draft_pick_${player.id}`
                }
            ],

            [
                {
                    text:
                        "⬅️ BACK TO DRAFT",

                    callback_data:
                        "draft_back"
                }
            ]
        ]
    };


    const messageId =
        draft.messageIds[userId];


    if (!messageId) {
        return;
    }


    try {

        await ctx.api.editMessageText(

            chatId = draft.chatId,
            messageId = messageId,

            text,

            {
                parse_mode: "HTML",

                reply_markup:
                    keyboard
            }
        );

    } catch (error) {

        console.error(
            "Player info edit error:",
            error.message
        );
    }
}


// ==========================================
// BACK TO DRAFT
// ==========================================

async function backToDraft(
    ctx,
    draft,
    userId
) {

    await ctx.answerCallbackQuery();

    await editDraftMessage(
        ctx,
        draft,
        userId
    );
}


// ==========================================
// PICK PLAYER
// ==========================================

async function pickPlayer(
    ctx,
    draft,
    userId,
    playerId
) {

    // Already ready
    if (draft.ready.has(userId)) {

        await ctx.answerCallbackQuery({
            text:
                "🔒 Your XI is already locked.",
            show_alert: true
        });

        return;
    }


    const team =
        draft.teams[userId];

    const pool =
        draft.pools[userId];


    // XI full
    if (team.length >= MAX_PLAYERS) {

        await ctx.answerCallbackQuery({
            text:
                "❌ Your XI is already 11/11!",
            show_alert: true
        });

        return;
    }


    // Find player ONLY inside captain's pool
    const player =
        getPlayer(
            pool,
            playerId
        );


    if (!player) {

        await ctx.answerCallbackQuery({
            text:
                "❌ This player is not in your 15-player pool.",
            show_alert: true
        });

        return;
    }


    // Already selected
    const alreadySelected =
        team.some(
            p =>
                Number(p.id) ===
                Number(player.id)
        );


    if (alreadySelected) {

        await ctx.answerCallbackQuery({
            text:
                "⚠️ Player already selected.",
            show_alert: true
        });

        return;
    }


    // Add
    team.push(player);


    await ctx.answerCallbackQuery({

        text:
            `✅ ${player.name} added!`
    });


    // EDIT SAME MESSAGE
    await editDraftMessage(
        ctx,
        draft,
        userId
    );
}


// ==========================================
// REMOVE PLAYER
// ==========================================

async function removePlayer(
    ctx,
    draft,
    userId,
    playerId
) {

    if (draft.ready.has(userId)) {

        await ctx.answerCallbackQuery({
            text:
                "🔒 Your XI is already locked.",
            show_alert: true
        });

        return;
    }


    const team =
        draft.teams[userId];


    const index =
        team.findIndex(
            player =>
                Number(player.id) ===
                Number(playerId)
        );


    if (index === -1) {

        await ctx.answerCallbackQuery({
            text:
                "❌ Player isn't in your XI.",
            show_alert: true
        });

        return;
    }


    const player =
        team[index];


    team.splice(index, 1);


    await ctx.answerCallbackQuery({

        text:
            `↩️ ${player.name} removed.`
    });


    // EDIT SAME MESSAGE
    await editDraftMessage(
        ctx,
        draft,
        userId
    );
}


// ==========================================
// SHOW MY XI
// ==========================================

async function showTeam(
    ctx,
    draft,
    userId
) {

    const team =
        draft.teams[userId];


    let text =
        "👥 <b>YOUR XI</b>\n" +
        "━━━━━━━━━━━━━━━━━━\n\n";


    if (team.length === 0) {

        text +=
            "Your XI is empty.";

    } else {

        team.forEach(
            (player, index) => {

                text +=
                    `${index + 1}. ` +
                    `<b>${escapeHTML(
                        player.name
                    )}</b> — ` +
                    `${escapeHTML(
                        player.role || "Player"
                    )}\n`;
            }
        );
    }


    text +=
        `\n━━━━━━━━━━━━━━━━━━\n` +
        `🏏 XI: <b>${team.length}/11</b>`;


    const keyboard = [

        [
            {
                text:
                    "⬅️ BACK TO DRAFT",

                callback_data:
                    "draft_back"
            }
        ]

    ];


    if (
        team.length === MAX_PLAYERS &&
        !draft.ready.has(userId)
    ) {

        keyboard.push([

            {
                text:
                    "✅ READY",

                callback_data:
                    "draft_ready"
            }

        ]);
    }


    const messageId =
        draft.messageIds[userId];


    if (!messageId) {
        return;
    }


    await ctx.answerCallbackQuery();


    try {

        await ctx.api.editMessageText(

            draft.chatId,

            messageId,

            text,

            {
                parse_mode: "HTML",

                reply_markup: {
                    inline_keyboard:
                        keyboard
                }
            }
        );

    } catch (error) {

        console.error(
            "XI edit error:",
            error.message
        );
    }
}


// ==========================================
// READY SCREEN
// ==========================================

async function showReadyScreen(
    ctx,
    draft,
    userId
) {

    const team =
        draft.teams[userId];


    let text =
        "✅ <b>YOU ARE READY!</b>\n" +
        "━━━━━━━━━━━━━━━━━━\n\n" +

        `🏏 Your XI: <b>${team.length}/11</b>\n\n`;


    const otherCaptain =
        draft.captains.find(
            id => id !== userId
        );


    if (
        otherCaptain &&
        draft.ready.has(otherCaptain)
    ) {

        text +=
            "🔥 <b>Both captains are READY!</b>\n\n" +
            "⏳ Preparing match settings...";

    } else {

        text +=
            "🔒 Your XI is locked.\n\n" +
            "⏳ Waiting for the other captain...";
    }


    const messageId =
        draft.messageIds[userId];


    if (!messageId) {
        return;
    }


    try {

        await ctx.api.editMessageText(

            draft.chatId,

            messageId,

            text,

            {
                parse_mode: "HTML"
            }
        );

    } catch (error) {

        console.error(
            "Ready screen error:",
            error.message
        );
    }
}


// ==========================================
// BOTH READY → OVERS
// ==========================================

async function showOversScreen(
    ctx,
    draft
) {

    draft.status =
        "overs";


    const text =
        "🏏 <b>PITCH WARS</b>\n" +
        "━━━━━━━━━━━━━━━━━━\n\n" +

        "🔥 <b>DRAFT COMPLETE!</b>\n\n" +

        "👥 Both captains have selected their XI.\n" +
        "🔒 Both teams are locked.\n\n" +

        "🧪 <b>Testing Mode</b>\n\n" +

        "Select match overs:";


    const keyboard = {

        inline_keyboard: [

            [
                {
                    text:
                        "🏏 2 OVERS",

                    callback_data:
                        "draft_overs_2"
                }
            ],

            [
                {
                    text:
                        "5 OVERS",

                    callback_data:
                        "draft_overs_5"
                },

                {
                    text:
                        "10 OVERS",

                    callback_data:
                        "draft_overs_10"
                }
            ],

            [
                {
                    text:
                        "15 OVERS",

                    callback_data:
                        "draft_overs_15"
                },

                {
                    text:
                        "20 OVERS",

                    callback_data:
                        "draft_overs_20"
                }
            ]

        ]
    };


    // Edit BOTH captain messages
    for (
        const captainId
        of draft.captains
    ) {

        const messageId =
            draft.messageIds[captainId];


        if (!messageId) {
            continue;
        }


        try {

            await ctx.api.editMessageText(

                draft.chatId,

                messageId,

                text,

                {
                    parse_mode: "HTML",

                    reply_markup:
                        keyboard
                }
            );

        } catch (error) {

            console.error(
                `Overs screen error for ${captainId}:`,
                error.message
            );
        }
    }
}


// ==========================================
// READY
// ==========================================

async function readyCaptain(
    ctx,
    draft,
    userId
) {

    const team =
        draft.teams[userId];


    // Need 11
    if (team.length !== MAX_PLAYERS) {

        await ctx.answerCallbackQuery({

            text:
                `❌ Select exactly 11 players first. (${team.length}/11)`,

            show_alert: true
        });

        return;
    }


    // Already ready
    if (draft.ready.has(userId)) {

        await ctx.answerCallbackQuery({

            text:
                "✅ You are already READY!"
        });

        return;
    }


    // Mark ready
    draft.ready.add(userId);


    await ctx.answerCallbackQuery({

        text:
            "✅ XI locked!"
    });


    // BOTH READY
    if (
        draft.ready.size ===
        draft.captains.length
    ) {

        await showOversScreen(
            ctx,
            draft
        );

        return;
    }


    // Only this captain ready
    await showReadyScreen(
        ctx,
        draft,
        userId
    );
}


// ==========================================
// HANDLE OVERS
// ==========================================


async function handleOvers(
    ctx,
    draft,
    overs
) {

    const allowedOvers = [
        5,
        10,
        15,
        20
    ];

    // Invalid format
    if (!allowedOvers.includes(overs)) {

        await ctx.answerCallbackQuery({
            text:
                "❌ Invalid match format.",
            show_alert: true
        });

        return;
    }

    // Both captains must be ready
    if (
        draft.ready.size !==
        draft.captains.length
    ) {

        await ctx.answerCallbackQuery({
            text:
                "⏳ Both captains must be READY first.",
            show_alert: true
        });

        return;
    }

    // Format already selected
    if (
        draft.status ===
        "match_ready"
    ) {

        await ctx.answerCallbackQuery({
            text:
                `🏏 ${draft.overs}-over match is already selected.`
        });

        return;
    }

    // Save selected overs
    draft.overs =
        overs;

    draft.status =
        "match_ready";

    await ctx.answerCallbackQuery({
        text:
            `🏏 ${overs}-over match selected!`
    });

    const text =
        "🏏 <b>PITCH WARS — MATCH READY!</b>\n" +
        "━━━━━━━━━━━━━━━━━━\n\n" +

        "⚔️ <b>1v1 CRICKET BATTLE</b>\n\n" +

        "👥 Players: <b>2 Captains</b>\n" +
        `🏏 Overs: <b>${overs}</b>\n` +
        "👤 XI: <b>11 players each</b>\n\n" +

        "🔒 Both teams are locked.\n\n" +

        "🔥 <b>Match is ready to begin!</b>\n\n" +

        "🪙 Toss will begin next.";

    // Edit SAME message for both captains
    for (
        const captainId
        of draft.captains
    ) {

        const messageId =
            draft.messageIds[captainId];

        if (!messageId) {
            continue;
        }

        try {

            await ctx.api.editMessageText(
                draft.chatId,
                messageId,
                text,
                {
                    parse_mode:
                        "HTML"
                }
            );

        } catch (error) {

            console.error(
                `Match-ready edit error for ${captainId}:`,
                error.message
            );
        }
    }

    // Start match engine
    await match.startMatch(
        ctx,
        draft
    );
}


// ==========================================
// CALLBACK HANDLER
// ==========================================

async function handleDraftCallback(ctx) {

    const data =
        ctx.callbackQuery.data;

    const chatId =
        ctx.chat.id;

    const userId =
        ctx.from.id;


    const draft =
        drafts.get(chatId);


    if (!draft) {

        await ctx.answerCallbackQuery({

            text:
                "❌ Draft has expired.",

            show_alert: true
        });

        return;
    }


    // Captain check
    if (!draft.captains.includes(userId)) {

        await ctx.answerCallbackQuery({

            text:
                "❌ You are not a captain.",

            show_alert: true
        });

        return;
    }


    // ======================================
    // BACK
    // ======================================

    if (data === "draft_back") {

        await backToDraft(
            ctx,
            draft,
            userId
        );

        return;
    }


    // ======================================
    // MY XI
    // ======================================

    if (data === "draft_team") {

        await showTeam(
            ctx,
            draft,
            userId
        );

        return;
    }


    // ======================================
    // READY
    // ======================================

    if (data === "draft_ready") {

        await readyCaptain(
            ctx,
            draft,
            userId
        );

        return;
    }


    // ======================================
    // PICK
    // ======================================

    if (data.startsWith("draft_pick_")) {

        const playerId =
            Number(
                data.replace(
                    "draft_pick_",
                    ""
                )
            );


        await pickPlayer(
            ctx,
            draft,
            userId,
            playerId
        );

        return;
    }


    // ======================================
    // REMOVE
    // ======================================

    if (data.startsWith("draft_remove_")) {

        const playerId =
            Number(
                data.replace(
                    "draft_remove_",
                    ""
                )
            );


        await removePlayer(
            ctx,
            draft,
            userId,
            playerId
        );

        return;
    }


    // ======================================
    // PLAYER INFO
    // ======================================

    if (data.startsWith("draft_info_")) {

        const playerId =
            Number(
                data.replace(
                    "draft_info_",
                    ""
                )
            );


        await showPlayerInfo(
            ctx,
            draft,
            userId,
            playerId
        );

        return;
    }


    // ======================================
    // OVERS
    // ======================================

    if (data.startsWith("draft_overs_")) {

        const overs =
            Number(
                data.replace(
                    "draft_overs_",
                    ""
                )
            );


        await handleOvers(
            ctx,
            draft,
            overs
        );

        return;
    }


    // Unknown
    await ctx.answerCallbackQuery();
}


// ==========================================
// EXPORT
// ==========================================

module.exports = {

    startDraft,

    getDraft,

    openDraft,

    handleDraftCallback

};