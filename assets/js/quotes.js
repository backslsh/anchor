/* quotes.js — daily rotation. Deterministic per calendar day so the same
   day always shows the same line; the shuffle button walks an offset. */

export const QUOTES = [
  // ── Stoics & classical ─────────────────────────────────────
  { text: 'You have power over your mind — not outside events. Realize this, and you will find strength.', by: 'Marcus Aurelius' },
  { text: 'We suffer more often in imagination than in reality.', by: 'Seneca' },
  { text: 'No man is free who is not master of himself.', by: 'Epictetus' },
  { text: 'It is not that we have a short time to live, but that we waste much of it.', by: 'Seneca' },
  { text: 'First say to yourself what you would be; then do what you have to do.', by: 'Epictetus' },
  { text: 'The impediment to action advances action. What stands in the way becomes the way.', by: 'Marcus Aurelius' },
  { text: 'He who conquers himself is the mightiest warrior.', by: 'Confucius' },
  { text: 'The greatest remedy for anger is delay.', by: 'Seneca' },
  { text: 'Waste no more time arguing what a good man should be. Be one.', by: 'Marcus Aurelius' },
  { text: 'Difficulties strengthen the mind, as labour does the body.', by: 'Seneca' },
  { text: 'Man conquers the world by conquering himself.', by: 'Zeno of Citium' },
  { text: 'The soul becomes dyed with the colour of its thoughts.', by: 'Marcus Aurelius' },
  { text: 'Begin at once to live, and count each separate day as a separate life.', by: 'Seneca' },
  { text: 'Nothing is enough for the man to whom enough is too little.', by: 'Epicurus' },
  { text: 'Do not spoil what you have by desiring what you have not.', by: 'Epicurus' },
  { text: 'Freedom is secured not by fulfilling desires, but by removing desire.', by: 'Epictetus' },
  { text: 'To be everywhere is to be nowhere.', by: 'Seneca' },
  { text: 'The best revenge is not to be like your enemy.', by: 'Marcus Aurelius' },
  { text: 'How long are you going to wait before you demand the best of yourself?', by: 'Epictetus' },
  { text: 'Every new beginning comes from some other beginning’s end.', by: 'Seneca' },

  // ── Persistence & recovery ─────────────────────────────────
  { text: 'Fall seven times, stand up eight.', by: 'Japanese proverb' },
  { text: 'A journey of a thousand miles begins with a single step.', by: 'Lao Tzu' },
  { text: 'The best time to plant a tree was twenty years ago. The second best time is now.', by: 'Proverb' },
  { text: 'Rock bottom became the solid foundation on which I rebuilt my life.', by: 'J.K. Rowling' },
  { text: 'Our greatest glory is not in never falling, but in rising every time we fall.', by: 'Confucius' },
  { text: 'What lies behind us and what lies before us are tiny matters compared to what lies within us.', by: 'Ralph Waldo Emerson' },
  { text: 'It does not matter how slowly you go so long as you do not stop.', by: 'Confucius' },
  { text: 'Courage is resistance to fear, mastery of fear — not absence of fear.', by: 'Mark Twain' },
  { text: 'The wound is the place where the light enters you.', by: 'Rumi' },
  { text: 'Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself.', by: 'Rumi' },
  { text: 'He who has a why to live can bear almost any how.', by: 'Friedrich Nietzsche' },
  { text: 'Not everything that is faced can be changed, but nothing can be changed until it is faced.', by: 'James Baldwin' },
  { text: 'You may have to fight a battle more than once to win it.', by: 'Margaret Thatcher' },
  { text: 'Perseverance is not a long race; it is many short races one after another.', by: 'Walter Elliot' },
  { text: 'Success is stumbling from failure to failure with no loss of enthusiasm.', by: 'Winston Churchill' },
  { text: 'Character cannot be developed in ease and quiet.', by: 'Helen Keller' },
  { text: 'The oak fought the wind and was broken; the willow bent and survived.', by: 'Proverb' },
  { text: 'What we do now echoes in eternity.', by: 'Marcus Aurelius' },
  { text: 'Little by little, one travels far.', by: 'Proverb' },
  { text: 'The cave you fear to enter holds the treasure you seek.', by: 'Joseph Campbell' },

  // ── Discipline & habit ─────────────────────────────────────
  { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', by: 'Will Durant' },
  { text: 'Discipline is choosing between what you want now and what you want most.', by: 'Abraham Lincoln' },
  { text: 'Motivation gets you started. Habit keeps you going.', by: 'Jim Ryun' },
  { text: 'The chains of habit are too light to be felt until they are too heavy to be broken.', by: 'Samuel Johnson' },
  { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', by: 'James Clear' },
  { text: 'Small disciplines repeated with consistency lead to great achievements.', by: 'John C. Maxwell' },
  { text: 'It is easier to prevent bad habits than to break them.', by: 'Benjamin Franklin' },
  { text: 'Nothing will work unless you do.', by: 'Maya Angelou' },
  { text: 'Well begun is half done.', by: 'Aristotle' },
  { text: 'Quality is not an act, it is a habit.', by: 'Aristotle' },
  { text: 'A year from now you may wish you had started today.', by: 'Karen Lamb' },
  { text: 'The successful warrior is the average person with laser-like focus.', by: 'Bruce Lee' },
  { text: 'Do not wait; the time will never be just right.', by: 'Napoleon Hill' },
  { text: 'Knowing is not enough; we must apply. Willing is not enough; we must do.', by: 'Goethe' },
  { text: 'The secret of getting ahead is getting started.', by: 'Mark Twain' },

  // ── Urges & the present moment ─────────────────────────────
  { text: 'You are not your urges. You are the one noticing them.', by: 'Anchor' },
  { text: 'An urge is a wave. Waves crest and waves break. You only have to float.', by: 'Anchor' },
  { text: 'The craving is loud, but it is not in charge.', by: 'Anchor' },
  { text: 'Between stimulus and response there is a space. In that space is our power to choose.', by: 'Viktor E. Frankl' },
  { text: 'Ten minutes. Just give it ten minutes and see what is left of it.', by: 'Anchor' },
  { text: 'Nothing that feels this urgent has ever been urgent.', by: 'Anchor' },
  { text: 'Feelings are visitors. Let them come and go.', by: 'Mooji' },
  { text: 'This too shall pass.', by: 'Persian proverb' },
  { text: 'Do not let the future disturb you. You will meet it with the same reason you meet the present.', by: 'Marcus Aurelius' },
  { text: 'Breathe. You have survived one hundred percent of your worst days.', by: 'Anchor' },
  { text: 'The urge wants you alone and in a hurry. Be neither.', by: 'Anchor' },
  { text: 'You can be in pain and still be okay.', by: 'Anchor' },
  { text: 'The moment you decide to wait it out, you have already won something.', by: 'Anchor' },
  { text: 'Name it. An urge that has been named is an urge that has been seen.', by: 'Anchor' },
  { text: 'What if you simply did not, this once?', by: 'Anchor' },

  // ── Self-compassion ────────────────────────────────────────
  { text: 'Be patient with yourself. Nothing in nature blooms all year.', by: 'Proverb' },
  { text: 'Talk to yourself like someone you love.', by: 'Brené Brown' },
  { text: 'Shame corrodes the very part of us that believes we can change.', by: 'Brené Brown' },
  { text: 'You cannot hate yourself into a version of yourself you can love.', by: 'Lori Deschene' },
  { text: 'A relapse is a data point, not a verdict.', by: 'Anchor' },
  { text: 'The record is permanent so you can learn from it, not so you can be punished by it.', by: 'Anchor' },
  { text: 'Progress is not the absence of falling. It is the shortening of the fall.', by: 'Anchor' },
  { text: 'You do not have to start over. You have to continue.', by: 'Anchor' },
  { text: 'Yesterday is a receipt, not a sentence.', by: 'Anchor' },
  { text: 'Judge the day by the seeds planted, not the harvest reaped.', by: 'Robert Louis Stevenson' },
  { text: 'Guilt says I did something bad. Shame says I am bad. Only one of those is useful.', by: 'Anchor' },
  { text: 'Kindness toward yourself is not permission. It is fuel.', by: 'Anchor' },

  // ── Perspective & identity ─────────────────────────────────
  { text: 'Every action you take is a vote for the type of person you wish to become.', by: 'James Clear' },
  { text: 'The two most important days in your life are the day you are born and the day you find out why.', by: 'Mark Twain' },
  { text: 'Watch your habits, they become character. Watch your character, it becomes your destiny.', by: 'Lao Tzu' },
  { text: 'He who has a firm will moulds the world to himself.', by: 'Goethe' },
  { text: 'What you do every day matters more than what you do once in a while.', by: 'Gretchen Rubin' },
  { text: 'Knowing yourself is the beginning of all wisdom.', by: 'Aristotle' },
  { text: 'The privilege of a lifetime is to become who you truly are.', by: 'Carl Jung' },
  { text: 'Until you make the unconscious conscious, it will direct your life and you will call it fate.', by: 'Carl Jung' },
  { text: 'We cannot change anything until we accept it.', by: 'Carl Jung' },
  { text: 'The curious paradox is that when I accept myself just as I am, then I can change.', by: 'Carl Rogers' },
  { text: 'Change might not be fast and it is not always easy. But with time and effort, almost any habit can be reshaped.', by: 'Charles Duhigg' },
  { text: 'A man is what he thinks about all day long.', by: 'Ralph Waldo Emerson' },
  { text: 'Life is really simple, but we insist on making it complicated.', by: 'Confucius' },
  { text: 'Owning our story is the bravest thing we will ever do.', by: 'Brené Brown' },
  { text: 'The unexamined life is not worth living.', by: 'Socrates' },

  // ── Momentum ───────────────────────────────────────────────
  { text: 'One day, or day one. You decide.', by: 'Proverb' },
  { text: 'Do something today that your future self will thank you for.', by: 'Sean Patrick Flanery' },
  { text: 'The distance between who you are and who you want to be is one honest day.', by: 'Anchor' },
  { text: 'Streaks are built by ordinary Tuesdays, not heroic Mondays.', by: 'Anchor' },
  { text: 'Boring consistency beats dramatic effort.', by: 'Anchor' },
  { text: 'The number on your streak is not the point. The person building it is.', by: 'Anchor' },
  { text: 'Nobody is watching. That is what makes it count.', by: 'Anchor' },
  { text: 'You are three days from a new personal best. You are always three days from something.', by: 'Anchor' },
  { text: 'Compound interest works on character too.', by: 'Anchor' },
  { text: 'Tonight you will either have a story about resisting or a note to write in this app. Choose.', by: 'Anchor' },
  { text: 'Energy and persistence conquer all things.', by: 'Benjamin Franklin' },
  { text: 'Act as if what you do makes a difference. It does.', by: 'William James' },
  { text: 'Nothing is impossible; the word itself says "I’m possible".', by: 'Audrey Hepburn' },
  { text: 'The only way out is through.', by: 'Robert Frost' },
  { text: 'Start where you are. Use what you have. Do what you can.', by: 'Arthur Ashe' },
  { text: 'If you are going through hell, keep going.', by: 'Winston Churchill' },
  { text: 'Hope is not a strategy, but neither is despair.', by: 'Anchor' },
  { text: 'The record only moves forward. So do you.', by: 'Anchor' },
];

/** Stable per-day index so today's quote is the same all day. */
function dayIndex(dateISO) {
  let h = 2166136261;
  for (const ch of dateISO) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

export function quoteFor(dateISO, pool, offset = 0) {
  const list = pool && pool.length ? pool : QUOTES;
  return list[(dayIndex(dateISO) + offset) % list.length];
}

/** Merge built-ins with the user's own, giving each a stable id. */
export function quotePool(custom = []) {
  return [
    ...QUOTES.map((q, i) => ({ ...q, id: 'q' + i })),
    ...custom,
  ];
}
