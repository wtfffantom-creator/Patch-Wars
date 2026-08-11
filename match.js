// ==========================================
// PITCH WARS - MATCH ENGINE
// Testing Mode: 2 Overs
// ==========================================

const matches = new Map();

const BALLS_PER_OVER = 6;


// ==========================================
// STRATEGIES
// ==========================================

const BOWLING_OPTIONS = [
    {
        id: "defensive",
        text: "🛡️ Defensive"
    },
    {
        id: "attacking",
        text: "⚔️ Attacking"
    },
    {
        id: "yorker",
        text: "🎯 Yorker"
    },
    {
        id: "variation",
        text: "🔄 Variation"
    },
    {
        id: "aggressive",
        text: "💥 Aggressive"
    }
];

const BATTING_OPTIONS = [
    {
        id: "defensive",
        text: "🛡️ Defensive"
    },
    {
        id: "attacking",
        text: "⚔️ Attacking"
    },
    {
        id: "placement",
        text: "🏃 Placement"
    },
    {
        id: "power",
        text: "💥 Power Shot"
    },
    {
        id: "risky",
        text: "🎯 Risky Shot"
    }
];


// ==========================================
// UTILS
// ==========================================

function random(min, max) {
    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;
}


function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}


function getName(player) {
    return player?.name || "Unknown Player";
}


function getRole(player) {
    return player?.role || "Player";
}


// ==========================================
// CREATE MATCH
// ==========================================

function createMatch(chatId, draft) {

    if (!draft) {
        throw new Error("Draft not found.");
    }

    if (!draft.captains || draft.captains.length !== 2) {
        throw new Error(
            "Exactly two captains are required."
        );
    }


    const captain1 =
        draft.captains[0];

    const captain2 =
        draft.captains[1];


    const team1 =
        [...(draft.teams[captain1] || [])];

    const team2 =
        [...(draft.teams[captain2] || [])];


    if (team1.length !== 11 ||
        team2.length !== 11) {

        throw new Error(
            "Both teams must have 11 players."
        );
    }


    const match = {

        chatId,

        captains: [
            captain1,
            captain2
        ],

        teams: {
            [captain1]: team1,
            [captain2]: team2
        },

        teamNames: {
            [captain1]: "Team 1",
            [captain2]: "Team 2"
        },

        innings: 0,

        battingCaptain: null,

        bowlingCaptain: null,

        striker: null,

        nonStriker: null,

        bowler: null,

        score: 0,

        wickets: 0,

        balls: 0,

        over: 0,

        // Selected match format from draft
        overs:
            Number(draft.overs) || 5,

        ballInOver: 0,

        target: null,

        status: "toss",

        tossWinner: null,

        inningsScores: [],

        currentOverRuns: 0,

        currentOverWickets: 0,

        overHistory: [],

        ballHistory: [],

        battingStats: {},

        bowlingStats: {},

        pendingBowler: null,

        pendingBowlerChoice: null,

        pendingBatterChoice: null,

        messageId: null,

        lastResult: null
    };


    // Initialize batting stats
    for (const player of [
        ...team1,
        ...team2
    ]) {

        match.battingStats[player.id] = {

            player,

            runs: 0,

            balls: 0,

            fours: 0,

            sixes: 0,

            out: false
        };
    }


    // Initialize bowling stats
    for (const player of [
        ...team1,
        ...team2
    ]) {

        match.bowlingStats[player.id] = {

            player,

            balls: 0,

            runs: 0,

            wickets: 0
        };
    }


    matches.set(
        chatId,
        match
    );


    return match;
}


// ==========================================
// GET MATCH
// ==========================================

function getMatch(chatId) {
    return matches.get(chatId);
}


// ==========================================
// TOSS
// ==========================================

async function startToss(ctx, match) {

    match.status = "toss";

    const winner =
        Math.random() < 0.5
            ? match.captains[0]
            : match.captains[1];


    match.tossWinner =
        winner;


    const loser =
        match.captains.find(
            id => id !== winner
        );


    const text =
        "🪙 <b>TOSS</b>\n" +
        "━━━━━━━━━━━━━━━━━━\n\n" +

        `🏆 Toss Winner: <b>${escapeHTML(
            winner === match.captains[0]
                ? "Team 1"
                : "Team 2"
        )}</b>\n\n` +

        "Choose your decision:";


    const keyboard = {

        inline_keyboard: [

            [
                {
                    text: "🏏 BAT FIRST",
                    callback_data:
                        "match_toss_bat"
                }
            ],

            [
                {
                    text: "🎳 BOWL FIRST",
                    callback_data:
                        "match_toss_bowl"
                }
            ]

        ]
    };


    const message =
        await ctx.reply(
            text,
            {
                parse_mode: "HTML",
                reply_markup: keyboard
            }
        );


    match.messageId =
        message.message_id;


    match.tossWinner =
        winner;

    match.tossLoser =
        loser;
}


// ==========================================
// START INNINGS
// ==========================================

async function startInnings(
    ctx,
    match,
    battingCaptain,
    bowlingCaptain
) {

    match.innings++;

    match.battingCaptain =
        battingCaptain;

    match.bowlingCaptain =
        bowlingCaptain;


    match.score = 0;

    match.wickets = 0;

    match.balls = 0;

    match.over = 0;

    match.ballInOver = 0;

    match.currentOverRuns = 0;

    match.currentOverWickets = 0;

    match.ballHistory = [];


    const battingTeam =
        match.teams[battingCaptain];


    const bowlingTeam =
        match.teams[bowlingCaptain];


    // First two batsmen
    match.striker =
        battingTeam[0];

    match.nonStriker =
        battingTeam[1];


    // First bowler
    match.bowler =
        getBestBowler(
            bowlingTeam
        );


    match.status =
        "bowler_choice";


    await updateMatchMessage(
        ctx,
        match,
        getBowlerText(match),
        getBowlerKeyboard()
    );
}


// ==========================================
// FIND BOWLER
// ==========================================

function getBestBowler(team) {

    const bowlers =
        team.filter(
            p => {

                const role =
                    String(
                        p.role || ""
                    ).toLowerCase();

                return (
                    role.includes("bowl") ||
                    role.includes("all")
                );
            }
        );


    if (bowlers.length > 0) {

        return bowlers[0];
    }


    return team[0];
}


// ==========================================
// BOWLER SCREEN
// ==========================================

function getBowlerText(match) {

    const battingTeam =
        match.battingCaptain ===
        match.captains[0]
            ? "Team 1"
            : "Team 2";


    const bowlingTeam =
        match.bowlingCaptain ===
        match.captains[0]
            ? "Team 1"
            : "Team 2";


    return (
        "🏏 <b>PITCH WARS</b>\n" +
        "━━━━━━━━━━━━━━━━━━\n\n" +

        `📍 Innings: <b>${match.innings}/2</b>\n` +

        `🏏 ${escapeHTML(battingTeam)}: ` +
        `<b>${match.score}/${match.wickets}</b>\n` +

        `📊 Over: <b>${match.over}.${match.ballInOver}</b> ` +
        `/ ${match.overs}.0\n\n` +

        `👤 Striker: <b>${escapeHTML(
            getName(match.striker)
        )}</b>\n` +

        `👤 Non-Striker: <b>${escapeHTML(
            getName(match.nonStriker)
        )}</b>\n\n` +

        `🎳 Bowler: <b>${escapeHTML(
            getName(match.bowler)
        )}</b>\n\n` +

        "⚡ <b>Choose your bowling strategy</b>"
    );
}


// ==========================================
// BOWLER BUTTONS
// ==========================================

function getBowlerKeyboard() {

    return {

        inline_keyboard:
            BOWLING_OPTIONS.map(
                option => [

                    {
                        text: option.text,

                        callback_data:
                            `match_bowl_${option.id}`
                    }

                ]
            )
    };
}


// ==========================================
// BATTER SCREEN
// ==========================================

function getBatterText(match) {

    const battingTeam =
        match.battingCaptain ===
        match.captains[0]
            ? "Team 1"
            : "Team 2";


    return (
        "🏏 <b>PITCH WARS</b>\n" +
        "━━━━━━━━━━━━━━━━━━\n\n" +

        `📍 Innings: <b>${match.innings}/2</b>\n` +

        `🏏 ${escapeHTML(battingTeam)}: ` +
        `<b>${match.score}/${match.wickets}</b>\n` +

        `📊 Over: <b>${match.over}.${match.ballInOver}</b> ` +
        `/ ${match.overs}.0\n\n` +

        `🎳 Bowler: <b>${escapeHTML(
            getName(match.bowler)
        )}</b>\n\n` +

        `🏏 Striker: <b>${escapeHTML(
            getName(match.striker)
        )}</b>\n` +

        `👤 Non-Striker: <b>${escapeHTML(
            getName(match.nonStriker)
        )}</b>\n\n` +

        "⚡ <b>Choose your batting strategy</b>"
    );
}


// ==========================================
// BATTER BUTTONS
// ==========================================

function getBatterKeyboard() {

    return {

        inline_keyboard:
            BATTING_OPTIONS.map(
                option => [

                    {
                        text: option.text,

                        callback_data:
                            `match_bat_${option.id}`
                    }

                ]
            )
    };
}


// ==========================================
// PROCESS BOWLER CHOICE
// ==========================================

async function processBowlerChoice(
    ctx,
    match,
    choice
) {

    if (
        match.status !==
        "bowler_choice"
    ) {

        await ctx.answerCallbackQuery({
            text:
                "⚠️ It is not the bowling turn."
        });

        return;
    }


    match.pendingBowlerChoice =
        choice;

    match.status =
        "batter_choice";


    await ctx.answerCallbackQuery({
        text:
            "🎯 Bowling strategy selected!"
    });


    await updateMatchMessage(
        ctx,
        match,
        getBatterText(match),
        getBatterKeyboard()
    );
}


// ==========================================
// PROCESS BATTER CHOICE
// ==========================================


async function processBatterChoice(
    ctx,
    match,
    choice
) {

    if (match.status !== "batter_choice") {

        await ctx.answerCallbackQuery({
            text: "⚠️ It is not the batting turn."
        });

        return;
    }

    if (ctx.from.id !== match.battingCaptain) {

        await ctx.answerCallbackQuery({
            text: "❌ Only the batting captain can choose.",
            show_alert: true
        });

        return;
    }

    match.pendingBatterChoice = choice;

    await ctx.answerCallbackQuery({
        text: "🏏 Shot locked! Simulating 6 balls..."
    });

    await simulateOver(ctx, match);
}


// ==========================================
// SIMULATE COMPLETE OVER
// ==========================================

async function simulateOver(ctx, match) {

    const battingTeam =
        match.teams[match.battingCaptain];

    const overNumber =
        match.over + 1;

    let ballsPlayed = 0;

    while (
        ballsPlayed < BALLS_PER_OVER &&
        match.wickets < battingTeam.length
    ) {

        // Chase complete
        if (
            match.innings === 2 &&
            match.target !== null &&
            match.score >= match.target
        ) {
            await finishMatch(
                ctx,
                match,
                "chase"
            );
            return;
        }

        const striker =
            match.striker;

        const bowler =
            match.bowler;

        if (!striker || !bowler) {
            console.error("Missing striker/bowler");
            return;
        }

        const result =
            calculateBallResult(
                striker,
                bowler,
                match.pendingBowlerChoice,
                match.pendingBatterChoice
            );

        const battingStats =
            match.battingStats[striker.id];

        const bowlingStats =
            match.bowlingStats[bowler.id];

        // Ball count
        match.balls++;
        match.ballInOver++;
        ballsPlayed++;

        battingStats.balls++;
        bowlingStats.balls++;

        // ======================================
        // WICKET
        // ======================================

        if (result.wicket) {

            match.wickets++;
            match.currentOverWickets++;

            battingStats.out = true;
            bowlingStats.wickets++;

            match.ballHistory.push({

                over: overNumber,

                ball:
                    match.ballInOver,

                batsman: striker,

                bowler: bowler,

                runs: 0,

                wicket: true,

                text: result.text
            });

            match.lastResult =
                result.text;

            // Find next batsman
            const used =
                new Set(
                    Object.values(
                        match.battingStats
                    )
                    .filter(
                        stat => stat.out
                    )
                    .map(
                        stat => stat.player.id
                    )
                );

            const nextBatter =
                battingTeam.find(
                    player =>
                        !used.has(player.id) &&
                        player.id !==
                            match.nonStriker.id
                );

            if (nextBatter) {

                match.striker =
                    nextBatter;

            } else {

                match.wickets =
                    battingTeam.length;
            }

        } else {

            // ======================================
            // RUNS
            // ======================================

            const runs =
                result.runs;

            match.score += runs;

            match.currentOverRuns +=
                runs;

            battingStats.runs +=
                runs;

            bowlingStats.runs +=
                runs;

            if (runs === 4) {
                battingStats.fours++;
            }

            if (runs === 6) {
                battingStats.sixes++;
            }

            match.ballHistory.push({

                over: overNumber,

                ball:
                    match.ballInOver,

                batsman: striker,

                bowler: bowler,

                runs: runs,

                wicket: false,

                text: result.text
            });

            match.lastResult =
                result.text;

            // Odd runs = strike change
            if (runs % 2 === 1) {
                swapStrike(match);
            }
        }

        // Chase complete
        if (
            match.innings === 2 &&
            match.target !== null &&
            match.score >= match.target
        ) {

            await finishMatch(
                ctx,
                match,
                "chase"
            );

            return;
        }

        // All out
        if (
            match.wickets >=
            battingTeam.length
        ) {

            await finishInnings(
                ctx,
                match
            );

            return;
        }
    }

    // ======================================
    // OVER COMPLETE
    // ======================================

    match.pendingBowlerChoice = null;
    match.pendingBatterChoice = null;

    await finishOver(
        ctx,
        match
    );
}


// ==========================================
// OLD SINGLE-BALL ENGINE
// Kept for compatibility
// ==========================================

async function processBall(ctx, match) {

    await simulateOver(
        ctx,
        match
    );
}


// ==========================================
// CALCULATE BALL RESULT
// ==========================================

function calculateBallResult(
    batter,
    bowler,
    bowlingChoice,
    battingChoice
) {

    const batterRole =
        String(
            batter?.role || ""
        ).toLowerCase();


    const bowlerRole =
        String(
            bowler?.role || ""
        ).toLowerCase();


    let wicketChance = 0.10;

    let sixChance = 0.08;

    let fourChance = 0.15;


    // Batter role
    if (
        batterRole.includes("batter")
    ) {

        fourChance += 0.05;

        sixChance += 0.04;
    }


    if (
        batterRole.includes("bowler")
    ) {

        fourChance -= 0.04;

        sixChance -= 0.03;

        wicketChance += 0.05;
    }


    // Bowling strategy
    switch (bowlingChoice) {

        case "defensive":

            wicketChance -= 0.02;

            fourChance -= 0.05;

            sixChance -= 0.04;

            break;


        case "attacking":

            wicketChance += 0.07;

            fourChance += 0.02;

            break;


        case "yorker":

            wicketChance += 0.05;

            sixChance -= 0.04;

            break;


        case "variation":

            wicketChance += 0.04;

            fourChance -= 0.02;

            break;


        case "aggressive":

            wicketChance += 0.10;

            sixChance += 0.03;

            fourChance += 0.03;

            break;
    }


    // Batting strategy
    switch (battingChoice) {

        case "defensive":

            wicketChance -= 0.06;

            fourChance -= 0.06;

            sixChance -= 0.05;

            break;


        case "attacking":

            fourChance += 0.06;

            sixChance += 0.05;

            wicketChance += 0.04;

            break;


        case "placement":

            fourChance += 0.02;

            wicketChance -= 0.02;

            break;


        case "power":

            sixChance += 0.09;

            fourChance += 0.05;

            wicketChance += 0.08;

            break;


        case "risky":

            sixChance += 0.12;

            fourChance += 0.06;

            wicketChance += 0.13;

            break;
    }


    wicketChance =
        Math.max(
            0.02,
            Math.min(
                wicketChance,
                0.55
            )
        );


    fourChance =
        Math.max(
            0.03,
            Math.min(
                fourChance,
                0.40
            )
        );


    sixChance =
        Math.max(
            0.02,
            Math.min(
                sixChance,
                0.30
            )
        );


    const roll =
        Math.random();


    // WICKET
    if (
        roll < wicketChance
    ) {

        return {

            wicket: true,

            runs: 0,

            text:
                `💥 WICKET! ${getName(batter)} is OUT!`
        };
    }


    // SIX
    if (
        roll < wicketChance + sixChance
    ) {

        return {

            wicket: false,

            runs: 6,

            text:
                `💥 SIX! ${getName(batter)} sends it over the boundary!`
        };
    }


    // FOUR
    if (
        roll <
        wicketChance +
        sixChance +
        fourChance
    ) {

        return {

            wicket: false,

            runs: 4,

            text:
                `🔥 FOUR! ${getName(batter)} finds the boundary!`
        };
    }


    // Other runs
    const value =
        Math.random();


    if (value < 0.15) {

        return {
            wicket: false,
            runs: 3,
            text: "🏃 THREE RUNS!"
        };
    }


    if (value < 0.45) {

        return {
            wicket: false,
            runs: 2,
            text: "🏃 TWO RUNS!"
        };
    }


    if (value < 0.75) {

        return {
            wicket: false,
            runs: 1,
            text: "🏃 ONE RUN!"
        };
    }


    return {

        wicket: false,

        runs: 0,

        text:
            "🛡️ DOT BALL!"
    };
}


// ==========================================
// SHOW BALL RESULT
// ==========================================

async function showBallResult(ctx, match) {

    const score = `${match.score}/${match.wickets}`;

    const rr = match.balls > 0
        ? (match.score / (match.balls / 6)).toFixed(2)
        : "0.00";

    const currentOver =
        `${match.over}.${match.ballInOver}`;

    const text =
        "🏏 <b>PITCH WARS</b>\n" +
        "━━━━━━━━━━━━━━━━━━\n\n" +

        `💥 <b>${escapeHTML(match.lastResult)}</b>\n\n` +

        `📊 Score: <b>${score}</b>\n` +
        `📍 Over: <b>${currentOver}</b> / ${match.overs}.0\n` +
        `📈 Run Rate: <b>${rr}</b>\n\n` +

        `🏏 Striker: <b>${escapeHTML(
            getName(match.striker)
        )}</b>\n` +

        `👤 Non-Striker: <b>${escapeHTML(
            getName(match.nonStriker)
        )}</b>\n\n` +

        `🎳 Bowler: <b>${escapeHTML(
            getName(match.bowler)
        )}</b>\n\n` +

        "━━━━━━━━━━━━━━━━━━\n" +
        "🎳 <b>Bowler, choose your strategy:</b>";

    match.status = "bowler_choice";

    match.pendingBowlerChoice = null;
    match.pendingBatterChoice = null;

    await updateMatchMessage(
        ctx,
        match,
        text,
        getBowlerKeyboard()
    );
}


// ==========================================
// SWAP STRIKE
// ==========================================

function swapStrike(match) {

    const temp = match.striker;

    match.striker = match.nonStriker;

    match.nonStriker = temp;
}


// ==========================================
// FINISH OVER
// ==========================================

async function finishOver(ctx, match) {

    match.over++;

    match.overHistory.push({
        over: match.over,
        runs: match.currentOverRuns,
        wickets: match.currentOverWickets,
        score: match.score,
        balls: BALLS_PER_OVER
    });

    const overRuns =
        match.currentOverRuns;

    const overWickets =
        match.currentOverWickets;

    match.currentOverRuns = 0;
    match.currentOverWickets = 0;
    match.ballInOver = 0;

    // ======================================
    // INNINGS END
    // ======================================

    if (match.over >= match.overs) {

        await finishInnings(
            ctx,
            match
        );

        return;
    }


    // End-of-over strike change
    swapStrike(match);


    // ======================================
    // NEXT BOWLER
    // ======================================

    const bowlingTeam =
        match.teams[
            match.bowlingCaptain
        ];

    match.bowler =
        getNextBowler(
            bowlingTeam,
            match.bowler
        );

    match.status =
        "bowler_choice";


    const text =
        "🏏 <b>OVER COMPLETE</b>\n" +
        "━━━━━━━━━━━━━━━━━━\n\n" +

        `📍 Over <b>${match.over}</b>\n` +
        `🏃 Runs: <b>${overRuns}</b>\n` +
        `💥 Wickets: <b>${overWickets}</b>\n\n` +

        `📊 Score: <b>${match.score}/${match.wickets}</b>\n` +
        `📈 Run Rate: <b>${getRunRate(match)}</b>\n\n` +

        `🏏 Striker: <b>${escapeHTML(
            getName(match.striker)
        )}</b>\n` +

        `👤 Non-Striker: <b>${escapeHTML(
            getName(match.nonStriker)
        )}</b>\n\n` +

        `🎳 Next Bowler: <b>${escapeHTML(
            getName(match.bowler)
        )}</b>\n\n` +

        "━━━━━━━━━━━━━━━━━━\n" +
        "🎯 <b>Choose bowling strategy:</b>";


    await updateMatchMessage(
        ctx,
        match,
        text,
        getBowlerKeyboard()
    );
}


// ==========================================
// NEXT BOWLER
// ==========================================

function getNextBowler(team, previous) {

    const possible =
        team.filter(
            player =>
                player.id !== previous?.id
        );

    if (possible.length === 0) {
        return team[0];
    }


    const bowlers =
        possible.filter(player => {

            const role =
                String(
                    player.role || ""
                ).toLowerCase();

            return (
                role.includes("bowl") ||
                role.includes("all")
            );
        });


    if (bowlers.length > 0) {
        return bowlers[0];
    }


    return possible[0];
}


// ==========================================
// FINISH INNINGS
// ==========================================

async function finishInnings(ctx, match) {

    const battingCaptain =
        match.battingCaptain;


    match.inningsScores.push({

        innings: match.innings,

        captain: battingCaptain,

        score: match.score,

        wickets: match.wickets,

        overs:
            `${match.over}.${match.ballInOver}`,

        runRate:
            getRunRate(match)
    });


    // ======================================
    // FIRST INNINGS → SECOND INNINGS
    // ======================================

    if (match.innings === 1) {

        match.target =
            match.score + 1;


        const oldBatting =
            match.battingCaptain;

        const oldBowling =
            match.bowlingCaptain;


        await showInningsBreak(
            ctx,
            match
        );


        // Small delay before innings 2
        setTimeout(
            async () => {

                try {

                    await startInnings(
                        ctx,
                        match,
                        oldBowling,
                        oldBatting
                    );

                } catch (error) {

                    console.error(
                        "Second innings error:",
                        error
                    );
                }

            },
            1500
        );


        return;
    }


    // ======================================
    // SECOND INNINGS COMPLETE
    // ======================================

    await finishMatch(
        ctx,
        match,
        "normal"
    );
}


// ==========================================
// INNINGS BREAK
// ==========================================

async function showInningsBreak(ctx, match) {

    const previous =
        match.inningsScores[
            match.inningsScores.length - 1
        ];


    const battingTeam =
        previous.captain ===
        match.captains[0]
            ? "Team 1"
            : "Team 2";


    const text =
        "🏏 <b>INNINGS BREAK</b>\n" +
        "━━━━━━━━━━━━━━━━━━\n\n" +

        `🏏 ${escapeHTML(
            battingTeam
        )}: <b>${previous.score}/${previous.wickets}</b>\n` +

        `📍 Overs: <b>${previous.overs}</b>\n` +

        `📈 Run Rate: <b>${previous.runRate}</b>\n\n` +

        `🎯 <b>Target: ${match.target}</b>\n\n` +

        "🔥 Second innings is starting...";


    await updateMatchMessage(
        ctx,
        match,
        text,
        null
    );
}


// ==========================================
// RUN RATE
// ==========================================

function getRunRate(match) {

    if (match.balls <= 0) {
        return "0.00";
    }

    return (
        match.score /
        (match.balls / 6)
    ).toFixed(2);
}


// ==========================================
// FINISH MATCH
// ==========================================

async function finishMatch(
    ctx,
    match,
    reason
) {

    match.status = "finished";


    const first =
        match.inningsScores[0];


    const firstScore =
        first?.score || 0;

    const secondScore =
        match.score;


    let winnerText;


    if (secondScore > firstScore) {

        const wicketsLeft =
            Math.max(
                0,
                11 - match.wickets
            );

        winnerText =
            `🏆 <b>TEAM 2 WON!</b>\n\n` +
            `Won by <b>${wicketsLeft} wickets</b>.`;

    } else if (secondScore < firstScore) {

        const runs =
            firstScore - secondScore;

        winnerText =
            `🏆 <b>TEAM 1 WON!</b>\n\n` +
            `Won by <b>${runs} runs</b>.`;

    } else {

        winnerText =
            "🤝 <b>MATCH TIED!</b>";
    }


    const text =
        "🏆 <b>MATCH RESULT</b>\n" +
        "━━━━━━━━━━━━━━━━━━\n\n" +

        `🏏 <b>Team 1</b>\n` +
        `${firstScore}/${first?.wickets || 0} ` +
        `(${first?.overs || "2.0"})\n` +
        `📈 RR: ${first?.runRate || "0.00"}\n\n` +

        `🏏 <b>Team 2</b>\n` +
        `${secondScore}/${match.wickets} ` +
        `(${match.over}.${match.ballInOver})\n` +
        `📈 RR: ${getRunRate(match)}\n\n` +

        "━━━━━━━━━━━━━━━━━━\n\n" +

        winnerText +
        "\n\n" +

        getTopBatters(match) +
        "\n\n" +

        getBowlingSummary(match) +
        "\n\n" +

        getOverSummary(match);


    await updateMatchMessage(
        ctx,
        match,
        text,
        null
    );
}


// ==========================================
// TOP BATTERS
// ==========================================

function getTopBatters(match) {

    const stats =
        Object.values(
            match.battingStats
        )
        .filter(
            stat => stat.balls > 0
        )
        .sort(
            (a, b) =>
                b.runs - a.runs
        )
        .slice(0, 5);


    if (stats.length === 0) {

        return (
            "⭐ <b>BATTING</b>\n" +
            "No batting data."
        );
    }


    let text =
        "⭐ <b>TOP BATTERS</b>\n";


    for (const stat of stats) {

        text +=
            `🏏 ${escapeHTML(
                getName(stat.player)
            )} — ` +
            `<b>${stat.runs}</b> ` +
            `(${stat.balls})`;

        if (stat.fours) {
            text +=
                ` | 4s: ${stat.fours}`;
        }

        if (stat.sixes) {
            text +=
                ` | 6s: ${stat.sixes}`;
        }

        text += "\n";
    }


    return text.trim();
}


// ==========================================
// BOWLING SUMMARY
// ==========================================

function getBowlingSummary(match) {

    const stats =
        Object.values(
            match.bowlingStats
        )
        .filter(
            stat => stat.balls > 0
        )
        .sort(
            (a, b) =>
                b.wickets - a.wickets
        )
        .slice(0, 5);


    if (stats.length === 0) {

        return (
            "🎳 <b>BOWLING</b>\n" +
            "No bowling data."
        );
    }


    let text =
        "🎳 <b>BOWLING</b>\n";


    for (const stat of stats) {

        const overs =
            Math.floor(
                stat.balls / 6
            );

        const balls =
            stat.balls % 6;


        text +=
            `🎯 ${escapeHTML(
                getName(stat.player)
            )} — ` +
            `${overs}.${balls} ` +
            `| ${stat.runs}R ` +
            `| ${stat.wickets}W\n`;
    }


    return text.trim();
}


// ==========================================
// OVER SUMMARY
// ==========================================

function getOverSummary(match) {

    if (
        match.overHistory.length === 0
    ) {
        return "";
    }


    let text =
        "📊 <b>OVER SUMMARY</b>\n";


    for (
        const over
        of match.overHistory
    ) {

        text +=
            `Over ${over.over}: ` +
            `<b>${over.runs} runs</b>`;

        if (over.wickets > 0) {

            text +=
                ` | ${over.wickets}W`;
        }

        text +=
            ` | Score: ${over.score}\n`;
    }


    return text.trim();
}


// ==========================================
// UPDATE MATCH MESSAGE
// ==========================================

async function updateMatchMessage(
    ctx,
    match,
    text,
    replyMarkup
) {

    const options = {
        parse_mode: "HTML"
    };


    if (replyMarkup) {

        options.reply_markup =
            replyMarkup;
    }


    try {

        if (match.messageId) {

            await ctx.api.editMessageText(
                match.chatId,
                match.messageId,
                text,
                options
            );

            return;
        }


        const message =
            await ctx.reply(
                text,
                options
            );


        match.messageId =
            message.message_id;

    } catch (error) {

        console.error(
            "Match message error:",
            error.message
        );
    }
}


// ==========================================
// HANDLE MATCH CALLBACK
// ==========================================

async function handleMatchCallback(ctx) {

    const data =
        ctx.callbackQuery.data;

    const chatId =
        ctx.chat.id;

    const match =
        matches.get(chatId);


    if (!match) {

        await ctx.answerCallbackQuery({
            text:
                "❌ No active match.",
            show_alert: true
        });

        return;
    }


    // ======================================
    // TOSS - BAT
    // ======================================

    if (
        data === "match_toss_bat"
    ) {

        if (
            ctx.from.id !==
            match.tossWinner
        ) {

            await ctx.answerCallbackQuery({
                text:
                    "❌ Only the toss winner can choose.",
                show_alert: true
            });

            return;
        }


        await ctx.answerCallbackQuery({
            text:
                "🏏 Batting first!"
        });


        await startInnings(
            ctx,
            match,
            match.tossWinner,
            match.tossLoser
        );

        return;
    }


    // ======================================
    // TOSS - BOWL
    // ======================================

    if (
        data === "match_toss_bowl"
    ) {

        if (
            ctx.from.id !==
            match.tossWinner
        ) {

            await ctx.answerCallbackQuery({
                text:
                    "❌ Only the toss winner can choose.",
                show_alert: true
            });

            return;
        }


        await ctx.answerCallbackQuery({
            text:
                "🎳 Bowling first!"
        });


        await startInnings(
            ctx,
            match,
            match.tossLoser,
            match.tossWinner
        );

        return;
    }


    // ======================================
    // BOWLER CHOICE
    // ======================================

    if (
        data.startsWith(
            "match_bowl_"
        )
    ) {

        const choice =
            data.replace(
                "match_bowl_",
                ""
            );


        if (
            ctx.from.id !==
            match.bowlingCaptain
        ) {

            await ctx.answerCallbackQuery({
                text:
                    "❌ Only the bowling captain can choose.",
                show_alert: true
            });

            return;
        }


        await processBowlerChoice(
            ctx,
            match,
            choice
        );

        return;
    }


    // ======================================
    // BATTER CHOICE
    // ======================================

    if (
        data.startsWith(
            "match_bat_"
        )
    ) {

        const choice =
            data.replace(
                "match_bat_",
                ""
            );


        if (
            ctx.from.id !==
            match.battingCaptain
        ) {

            await ctx.answerCallbackQuery({
                text:
                    "❌ Only the batting captain can choose.",
                show_alert: true
            });

            return;
        }


        await processBatterChoice(
            ctx,
            match,
            choice
        );

        return;
    }


    await ctx.answerCallbackQuery();
}


// ==========================================
// START MATCH
// ==========================================

async function startMatch(ctx, draft) {

    const chatId =
        ctx.chat.id;


    if (
        matches.has(chatId)
    ) {

        await ctx.reply(
            "⚠️ A match is already running in this group."
        );

        return;
    }


    try {

        const match =
            createMatch(
                chatId,
                draft
            );


        await startToss(
            ctx,
            match
        );

    } catch (error) {

        console.error(
            "Match start error:",
            error
        );


        await ctx.reply(
            `❌ Match could not start.\n\n${escapeHTML(
                error.message
            )}`,
            {
                parse_mode: "HTML"
            }
        );
    }
}


// ==========================================
// EXPORT
// ==========================================

module.exports = {

    startMatch,

    getMatch,

    handleMatchCallback

};