/**
 * pages/DmTips.jsx
 *
 * Advice for the DM: what each module is for, and above all what goes where
 * in a campaign. Sessions, the Diary and the Journal all hold "notes about a
 * session" from a distance, and the difference — who sees it, and whether it
 * is a plan, a record or something the characters know — is the thing a new
 * DM gets wrong.
 *
 * A page of its own rather than a README in the docs modal: it is read in
 * full and returned to, and it needs tables the docs Markdown does not have.
 *
 * Static. If a module changes who can see what, change it here too — every
 * "who sees it" below is a claim about a server-side filter.
 */

import AppHeader from '@/components/layout/AppHeader';

/** "I have this — where does it go?" Ordered roughly as a campaign meets them. */
const WHERE = [
  ['What you might run next session — encounters, beats, a stat block to have ready',
    'Manage Campaigns → 🗓 Sessions: Before it begins, The session', 'Only you'],
  ['An idea for some day, not for any session yet',
    'Manage Campaigns → 🗓 Sessions → 📌 Campaign backlog', 'Only you'],
  ['Notes taken during play — what actually happened',
    'Manage Campaigns → 🗓 Sessions: What happened', 'Only you'],
  ['The short version of last time, to read aloud',
    'Manage Campaigns → 🗓 Sessions: Where we left off (generated when you mark a session played)',
    'Only you (you read it out)'],
  ['The story of a session, written up properly',
    '📔 Campaign Diary', 'The table, through the share link, once you publish it'],
  ['Something the characters found or learned — a letter, a rumour, a name',
    'Manage Campaigns → 📖 Journal', 'Everyone, only you, or one player — you choose per entry'],
  ['A secret only one character knows',
    '📖 Journal, set to “Only <player> (and me)” — or a note in their PC Sheet’s 📜 DM Notes',
    'You and that player — who can make it public with 📢'],
  ['When something happened in the world',
    '📜 Timeline (a 🌍 Party event if it was the whole group)', 'Hidden until you reveal it with 👁'],
  ['Who someone is', 'Manage Campaigns → 🧟 NPCs',
    'Description and public info once you mark them met; private info only you'],
  ['A place', 'Manage Campaigns → 📍 Locations', 'Players see it only while it is public'],
  ['How a character could grow — learning paths, teachers, homebrew',
    'Manage Campaigns → 🌱 Evolution', 'Only you'],
  ['How people are connected', 'Manage Campaigns → 🌳 Char Tree', 'Only you'],
  ['Where the party went', '🗺️ Journey Path Map (built from Timeline events with a place and a date)',
    'Only you, or the table by share link'],
  ['A spell or creature of your own, or a magic item', '🧪 Homebrew — then tick the campaigns that use it',
    'Only you, until you reveal it in a campaign'],
  ['How the players feel the game is going', 'Manage Campaigns → 📊 Surveys',
    'Players answer; anonymous by default'],
];

/** The three that get mixed up, side by side. */
const THREE = [
  {
    icon: '🗓', name: 'Sessions', what: 'Your workbench',
    lines: [
      'A plan, not a record of the story: cards you prepare, run and tick off.',
      'Players never see it — not a card, not a title.',
      'What happened is your raw notes from the night. Rough is fine.',
    ],
  },
  {
    icon: '📔', name: 'Campaign Diary', what: 'The record',
    lines: [
      'One entry per session, written as prose — the story so far.',
      'A draft until you press Publish; then it is on the share link.',
      'Players read it only through that link, never in the app.',
    ],
  },
  {
    icon: '📖', name: 'Journal', what: 'What the characters know',
    lines: [
      'The table’s shared notebook. Every player writes in it, not only you.',
      'Facts inside the world: documents, rumours, people met, dated in-game.',
      'Stage a find as hidden, then switch it to Everyone when the party finds it.',
    ],
  },
];

/** One session from start to finish, in the order the buttons are pressed. */
const FLOW = [
  ['Plan', 'In 🗓 Sessions, put what needs preparing under Before it begins and what could happen under The session. Pull ideas in from the 📌 backlog with → This session; send one back with → Backlog.'],
  ['Play', 'Move cards through In preparation → Ready → On-going → Done or Skipped. A parent’s state carries its sub-cards. Anything still on-going shows under Still running in the next sessions until you finish it where it lives.'],
  ['Write it down', 'Add what actually happened under What happened, during or straight after.'],
  ['Share discoveries', 'From What happened, 📖 To journal copies the cards you pick into the Journal — hidden by default, or for everyone, or for one player.'],
  ['Close the session', 'Mark it ✓ Played. It asks for the in-world date and offers to generate the next session: live cards carry forward, and What happened becomes the recap to read aloud.'],
  ['Tell the story', 'Write the 📔 Campaign Diary entry from What happened, then Publish it.'],
  ['Keep the world straight', 'Add the dated events to the 📜 Timeline, reveal the NPCs they met, make the places they found public.'],
];

/** Short advice per module, for the ones the table above does not cover. */
const MODULE_TIPS = [
  ['🏰 Manage Campaigns', [
    'Run the campaign from here. Most of the table above is a tab; the Diary, the Timeline and the map are modules of their own.',
    '🔍 Search looks through everything written down in the campaign at once.',
    'Settings exports the whole campaign as a backup file; Export part… carries only the world, the table or the history — to run it again with a new group, say.',
  ]],
  ['🧝 PC Character Sheet', [
    'You see every character. Each player’s 📔 Diary is theirs — you can read it, not edit it.',
    '📜 DM Notes is for things about that character: hidden until you switch one to visible.',
  ]],
  ['📜 Timeline', [
    'Events you write start hidden; 👁 reveals them when the party learns of them.',
    'Set the Today marker in Manage Campaigns so everyone knows where “now” is in the world.',
  ]],
  ['🧙 NPC Sheet and 🗡️ Item Cards', [
    'Free tools for stat blocks and item cards. An NPC’s stat block is also one click away from the ⚔ in Manage Campaigns → NPCs.',
  ]],
  ['🪟 Split View', [
    'Three or four pages on screen at once during play — the session prep, a stat block, a rulebook in the 📖 PDF Viewer. Save each arrangement as a profile.',
  ]],
];

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display uppercase tracking-widest text-gold text-sm border-b border-[var(--gold-dim)] pb-1">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DmTips() {
  return (
    <>
      <AppHeader icon="💡" name="DM Tips" />
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="max-w-4xl mx-auto flex flex-col gap-8 font-body text-text-dim text-sm leading-relaxed">
          <p className="text-text">
            Most of this app is about where a note lives — because where it lives decides who can read
            it. When in doubt, ask two questions: <strong>is it a plan or a record?</strong> and{' '}
            <strong>who should see it?</strong>
          </p>

          <Section title="Diary, Journal or Sessions?">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {THREE.map((t) => (
                <div key={t.name} className="bg-surface2 border border-border rounded-sm p-3 flex flex-col gap-1.5">
                  <p className="font-display uppercase tracking-wider text-gold text-xs">
                    {t.icon} {t.name}
                  </p>
                  <p className="text-text italic">{t.what}</p>
                  <ul className="list-disc pl-4 flex flex-col gap-1">
                    {t.lines.map((l) => <li key={l}>{l}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <p>
              A player also has their own <strong>📔 Diary</strong> on their character sheet. That is theirs, not
              the campaign’s: you can read it, nobody else can.
            </p>
          </Section>

          <Section title="What goes where">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="font-display uppercase tracking-wider text-[0.65rem] text-text-muted">
                    <th className="py-1.5 pr-3 font-normal">You have…</th>
                    <th className="py-1.5 pr-3 font-normal">Put it in</th>
                    <th className="py-1.5 font-normal">Who sees it</th>
                  </tr>
                </thead>
                <tbody>
                  {WHERE.map(([have, where, who]) => (
                    <tr key={have} className="border-t border-border align-top">
                      <td className="py-2 pr-3 text-text min-w-[12rem]">{have}</td>
                      <td className="py-2 pr-3 min-w-[12rem]">{where}</td>
                      <td className="py-2 min-w-[8rem]">{who}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="A session, start to finish">
            <ol className="flex flex-col gap-2">
              {FLOW.map(([step, text], i) => (
                <li key={step} className="flex gap-3">
                  <span className="font-display text-gold w-5 flex-shrink-0 text-right">{i + 1}</span>
                  <span><strong className="text-text">{step}.</strong> {text}</span>
                </li>
              ))}
            </ol>
          </Section>

          <Section title="Module by module">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MODULE_TIPS.map(([name, tips]) => (
                <div key={name} className="bg-surface2 border border-border rounded-sm p-3 flex flex-col gap-1.5">
                  <p className="font-display uppercase tracking-wider text-gold text-xs">{name}</p>
                  <ul className="list-disc pl-4 flex flex-col gap-1">
                    {tips.map((t) => <li key={t}>{t}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </main>
    </>
  );
}
