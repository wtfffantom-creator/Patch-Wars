const draft = require("./draft");

// ==========================================
// /TEAM
// ==========================================

async function teamCommand(ctx) {

    const chatId = ctx.chat.id;
    const userId = ctx.from.id;

    const game = draft.getDraft(chatId);

    if (!game) {
        await ctx.reply(
            "❌ <b>No active draft found.</b>\n\n" +
            "Start a match first.",
            {
                parse_mode: "HTML"
            }
        );

        return;
    }

    // Check captain
    if (!game.captains.includes(userId)) {
        await ctx.reply(
            "❌ <b>You are not a captain in this match.</b>",
            {
                parse_mode: "HTML"
            }
        );

        return;
    }

    const team = game.teams[userId] || [];

    if (team.length === 0) {

        await ctx.reply(
            "👥 <b>YOUR XI</b>\n" +
            "━━━━━━━━━━━━━━━━━━\n\n" +
            "❌ You haven't selected any players yet.\n\n" +
            "Use the draft buttons to select your XI.",
            {
                parse_mode: "HTML"
            }
        );

        return;
    }

    let text =
        "👥 <b>YOUR XI</b>\n" +
        "━━━━━━━━━━━━━━━━━━\n\n";

    team.forEach((player, index) => {

        text +=
            `${index + 1}. 🏏 <b>${escapeHTML(player.name)}</b>` +
            ` — ${escapeHTML(player.role || "Player")}\n`;
    });

    text +=
        "\n━━━━━━━━━━━━━━━━━━\n" +
        `🏏 <b>XI: ${team.length}/11</b>`;

    if (team.length === 11) {
        text += "\n\n✅ <b>XI COMPLETE</b>";
    } else {
        text +=
            `\n\n⏳ ${11 - team.length} player(s) remaining.`;
    }

    await ctx.reply(
        text,
        {
            parse_mode: "HTML"
        }
    );
}


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
// EXPORT
// ==========================================

module.exports = {
    teamCommand
};