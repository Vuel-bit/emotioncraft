(() => {
  const EC = (window.EC = window.EC || {});
  EC.DATA = EC.DATA || {};

  // Roster order controls unlock order (first 8 available, +1 per transcended).
  // "tagline" is kept as a backwards-compatible alias for "notes".
  EC.DATA.ROSTER = [
    // 1
    {
      id: 'nina_notation',
      levelId: 213,
      name: "Bowl Cut Benny",
      notes: "Thinks in bullet points.",
      tagline: "Thinks in bullet points.",
      portrait: 'assets/patients/1.png',
      mood: { label: 'Steady', template: 'Flat' },
      vibe: { label: 'Mid' },
      traits: [],
      quirks: [
        { type: 'AMPED', intensityTier: 0 },
      ],
    },

    // 2
    {
      id: 'dex_diminish',
      levelId: 214,
      name: "Camila Brown",
      notes: "Her eyebrows do the talking.",
      tagline: "Her eyebrows do the talking.",
      portrait: 'assets/patients/2.png',
      mood: { label: 'Steady', template: 'Flat' },
      vibe: { label: 'Mid' },
      traits: [],
      quirks: [
        { type: 'CRASHES', intensityTier: 1 },
      ],
    },

    // 3
    {
      id: 'sage_spinwell',
      levelId: 215,
      name: "Cardigan Stan",
      notes: "Sighs professionally.",
      tagline: "Sighs professionally.",
      portrait: 'assets/patients/3.png',
      mood: { label: 'Steady', template: 'Flat' },
      vibe: { label: 'Mid' },
      traits: [],
      quirks: [
        { type: 'SPIRALS', intensityTier: 0 },
      ],
    },

    // 4
    {
      id: 'steady_eddie',
      levelId: 201,
      name: "Curly Kid",
      notes: "He loves my stapler.",
      tagline: "He loves my stapler.",
      portrait: 'assets/patients/4.png',
      mood: { label: 'Steady', template: 'Flat' },
      vibe: { label: 'Mid' },
      traits: [],
      quirks: [
        { type: 'LOCKS_IN', intensityTier: 1 },
      ],
    },

    // 5
    {
      id: 'buzzy_barry',
      levelId: 202,
      name: "Barista Zina",
      notes: "Great coffee. Suspicious eyes.",
      tagline: "Great coffee. Suspicious eyes.",
      portrait: 'assets/patients/5.png',
      mood: { label: 'Steady', template: 'Tilted' },
      vibe: { label: 'Mid' },
      traits: [],
      quirks: [
        { type: 'LOCKS_IN', intensityTier: 1 },
        { type: 'AMPED', intensityTier: 0 },
      ],
    },

    // 6
    {
      id: 'waverly_wade',
      levelId: 203,
      name: "Daryl Downer",
      notes: "Keeps his happiness locked up.",
      tagline: "Keeps his happiness locked up.",
      portrait: 'assets/patients/6.png',
      mood: { label: 'Steady', template: 'Split' },
      vibe: { label: 'Mid' },
      traits: [],
      quirks: [
        { type: 'SPIRALS', intensityTier: 1 },
        { type: 'CRASHES', intensityTier: 1 },
      ],
    },

    // 7
    {
      id: 'tightwire_tina',
      levelId: 204,
      name: "Loverboy",
      notes: "He flirts with anything.",
      tagline: "He flirts with anything.",
      portrait: 'assets/patients/7.png',
      mood: { label: 'Steady', template: 'Tilted' },
      vibe: { label: 'Mid' },
      traits: [],
      quirks: [
        { type: 'AMPED', intensityTier: 1 },
        { type: 'CRASHES', intensityTier: 1 },
      ],
    },

    // 8
    {
      id: 'porcelain_paige',
      levelId: 205,
      name: "Tito Too Early",
      notes: "Oblivious to time.",
      tagline: "Oblivious to time.",
      portrait: 'assets/patients/8.png',
      mood: { label: 'Steady', template: 'Split' },
      vibe: { label: 'Mid' },
      traits: [],
      quirks: [
        { type: 'SPIRALS', intensityTier: 1 },
        { type: 'LOCKS_IN', intensityTier: 1 },
      ],
    },

    // 9
    {
      id: 'restless_rex',
      levelId: 206,
      name: "Wanda Whatever",
      notes: "One big warning sign.",
      tagline: "One big warning sign.",
      portrait: 'assets/patients/9.png',
      mood: { label: 'Steady', template: 'Spike' },
      vibe: { label: 'Mid' },
      traits: ['sensitive'],
      quirks: [
        { type: 'LOCKS_IN', intensityTier: 0 },
        { type: 'CRASHES', intensityTier: 0 },
        { type: 'AMPED', intensityTier: 1 },
      ],
    },

    // 10
    {
      id: 'clenchjaw_june',
      levelId: 211,
      name: "Ulga",
      notes: "She thinks everyone's talking about her.",
      tagline: "She thinks everyone's talking about her.",
      portrait: 'assets/patients/10.png',
      mood: { label: 'Steady', template: 'Flat' },
      vibe: { label: 'Mid' },
      traits: ['stubborn'],
      quirks: [
        { type: 'AMPED', intensityTier: 2 },
      ],
    },

    // 11
    {
      id: 'brickwall_ben',
      levelId: 207,
      name: "Carla Cookie",
      notes: "Chocolate chip is her fav.",
      tagline: "Chocolate chip is her fav.",
      portrait: 'assets/patients/11.png',
      mood: { label: 'Steady', template: 'Tilted' },
      vibe: { label: 'Mid' },
      traits: ['grounded'],
      quirks: [
        { type: 'SPIRALS', intensityTier: 2 },
        { type: 'LOCKS_IN', intensityTier: 0 },
      ],
    },

    // 12
    {
      id: 'fogbound_fiona',
      levelId: 208,
      name: "Side-Eye Aster",
      notes: "She's keeping notes on me.",
      tagline: "She's keeping notes on me.",
      portrait: 'assets/patients/12.png',
      mood: { label: 'Drained', template: 'Split' },
      vibe: { label: 'Mid' },
      traits: [],
      quirks: [
        { type: 'CRASHES', intensityTier: 2 },
        { type: 'SPIRALS', intensityTier: 1 },
      ],
    },

    // 13
    {
      id: 'cornered_carl',
      levelId: 209,
      name: "That Guy",
      notes: "Humility is AWOL.",
      tagline: "Humility is AWOL.",
      portrait: 'assets/patients/13.png',
      mood: { label: 'Antsy', template: 'Spike' },
      vibe: { label: 'Mid' },
      traits: [],
      quirks: [
        { type: 'AMPED', intensityTier: 2 },
        { type: 'LOCKS_IN', intensityTier: 0 },
        { type: 'CRASHES', intensityTier: 0 },
      ],
    },

    // 14
    {
      id: 'sally_sadeyes',
      levelId: 210,
      name: "Worry Wart Wade",
      notes: "He apologized to the chair.",
      tagline: "He apologized to the chair.",
      portrait: 'assets/patients/14.png',
      mood: { label: 'Drained', template: 'Flat' },
      vibe: { label: 'Anxious' },
      traits: [],
      quirks: [
        { type: 'AMPED', intensityTier: 1 },
        { type: 'SPIRALS', intensityTier: 0 },
        { type: 'LOCKS_IN', intensityTier: 0 },
      ],
    },

    // 15
    {
      id: 'hurricane_hank',
      levelId: 212,
      name: "Anita",
      notes: "She's judging me.",
      tagline: "She's judging me.",
      portrait: 'assets/patients/15.png',
      mood: { label: 'Antsy', template: 'Tilted' },
      vibe: { label: 'Blah' },
      traits: [],
      quirks: [
        { type: 'SPIRALS', intensityTier: 2 },
        { type: 'LOCKS_IN', intensityTier: 1 },
      ],
    },

    // 16
    {
      id: 'mara_moodneedle',
      levelId: 216,
      name: "Mr. O'Tool",
      notes: "My high school science teacher.",
      tagline: "My high school science teacher.",
      portrait: 'assets/patients/16.png',
      mood: { label: 'Steady', template: 'Split' },
      vibe: { label: 'Anxious' },
      traits: [],
      quirks: [
        { type: 'SPIRALS', intensityTier: 2 },
      ],
    },

    // 17
    {
      id: 'blake_blahline',
      levelId: 217,
      name: "Pat",
      notes: "My nosy neighbor.",
      tagline: "My nosy neighbor.",
      portrait: 'assets/patients/17.png',
      mood: { label: 'Steady', template: 'Tilted' },
      vibe: { label: 'Blah' },
      traits: [],
      quirks: [
        { type: 'AMPED', intensityTier: 1 },
        { type: 'CRASHES', intensityTier: 0 },
      ],
    },

    // 18
    {
      id: 'sienna_sighstorm',
      levelId: 218,
      name: "Mei",
      notes: "Strategy is her native tongue.",
      tagline: "Strategy is her native tongue.",
      portrait: 'assets/patients/18.png',
      mood: { label: 'Overwhelmed', template: 'Spike' },
      vibe: { label: 'Mid' },
      traits: ['sensitive'],
      quirks: [
        { type: 'LOCKS_IN', intensityTier: 2 },
        { type: 'AMPED', intensityTier: 0 },
        { type: 'SPIRALS', intensityTier: 0 },
      ],
    },

    // 19
    {
      id: 'gordon_grindlock',
      levelId: 219,
      name: "Moustache Hugo",
      notes: "He's Curly Kid's dad.",
      tagline: "He's Curly Kid's dad.",
      portrait: 'assets/patients/19.png',
      mood: { label: 'Spent', template: 'Split' },
      vibe: { label: 'Mid' },
      traits: ['stubborn', 'grounded'],
      quirks: [
        { type: 'CRASHES', intensityTier: 2 },
        { type: 'LOCKS_IN', intensityTier: 1 },
      ],
    },

    // 20
    {
      id: 'ollie_overcast',
      levelId: 220,
      name: "Frigid Franz",
      notes: "Emotional Outlook: Chilly.",
      tagline: "Emotional Outlook: Chilly.",
      portrait: 'assets/patients/20.png',
      mood: { label: 'Overwhelmed', template: 'Tilted' },
      vibe: { label: 'Blah' },
      traits: ['grounded'],
      quirks: [
        { type: 'SPIRALS', intensityTier: 2 },
        { type: 'LOCKS_IN', intensityTier: 0 },
      ],
    },

    // 21
    {
      id: 'spencer_spentwell',
      levelId: 221,
      name: "Frenzied Frida",
      notes: "Energy at unsafe levels.",
      tagline: "Energy at unsafe levels.",
      portrait: 'assets/patients/21.png',
      mood: { label: 'Spent', template: 'Spike' },
      vibe: { label: 'Anxious' },
      traits: ['stubborn'],
      quirks: [
        { type: 'AMPED', intensityTier: 2 },
        { type: 'CRASHES', intensityTier: 0 },
      ],
    },

    // 22
    {
      id: 'anita_anxidrift',
      levelId: 222,
      name: "Radar Zeek",
      notes: "He hears what I'm thinking.",
      tagline: "He hears what I'm thinking.",
      portrait: 'assets/patients/22.png',
      mood: { label: 'Antsy', template: 'Split' },
      vibe: { label: 'Anxious' },
      traits: [],
      quirks: [
        { type: 'LOCKS_IN', intensityTier: 1 },
        { type: 'CRASHES', intensityTier: 0 },
        { type: 'AMPED', intensityTier: 0 },
      ],
    },

    // 23
    {
      id: 'darla_drainshift',
      levelId: 223,
      name: "Maribel",
      notes: "She plans everything like it's a heist.",
      tagline: "She plans everything like it's a heist.",
      portrait: 'assets/patients/23.png',
      mood: { label: 'Drained', template: 'Tilted' },
      vibe: { label: 'Blah' },
      traits: [],
      quirks: [
        { type: 'CRASHES', intensityTier: 1 },
        { type: 'LOCKS_IN', intensityTier: 0 },
        { type: 'SPIRALS', intensityTier: 0 },
      ],
    },

    // 24
    {
      id: 'stuart_stressstop',
      levelId: 224,
      name: "Mr. Boring",
      notes: "His personality is on life support.",
      tagline: "His personality is on life support.",
      portrait: 'assets/patients/24.png',
      mood: { label: 'Antsy', template: 'Spike' },
      vibe: { label: 'Anxious' },
      traits: ['stubborn'],
      quirks: [
        { type: 'AMPED', intensityTier: 2 },
        { type: 'CRASHES', intensityTier: 0 },
      ],
    },

    // 25
    {
      id: 'carly_carespiral',
      levelId: 225,
      name: "Jean-Paul Unibrow",
      notes: "His brow has an opinion.",
      tagline: "His brow has an opinion.",
      portrait: 'assets/patients/25.png',
      mood: { label: 'Antsy', template: 'Split' },
      vibe: { label: 'Anxious' },
      traits: ['sensitive'],
      quirks: [
        { type: 'AMPED', intensityTier: 1 },
        { type: 'LOCKS_IN', intensityTier: 1 },
        { type: 'CRASHES', intensityTier: 1 },
        { type: 'SPIRALS', intensityTier: 1 },
      ],
    },

    // 26
    {
      id: 'selena_sunkstone',
      levelId: 226,
      name: "Pouty Patty",
      notes: "She is Carmen's sister.",
      tagline: "She is Carmen's sister.",
      portrait: 'assets/patients/26.png',
      mood: { label: 'Drained', template: 'Flat' },
      vibe: { label: 'Blah' },
      traits: ['sensitive', 'grounded'],
      quirks: [
        { type: 'CRASHES', intensityTier: 2 },
        { type: 'LOCKS_IN', intensityTier: 2 },
      ],
    },

    // 27
    {
      id: 'sleepy_sally',
      levelId: 227,
      name: "Sleepy Sally",
      notes: "She does not care.",
      tagline: "She does not care.",
      portrait: 'assets/patients/27.png',
      mood: { label: 'Drained', template: 'Flat' },
      vibe: { label: 'Blah' },
      traits: ['sensitive'],
      quirks: [
        { type: 'AMPED', intensityTier: 0 },
        { type: 'SPIRALS', intensityTier: 0 },
        { type: 'LOCKS_IN', intensityTier: 0 },
        { type: 'CRASHES', intensityTier: 0 },
      ],
    },

    // 28
    {
      id: 'buford_okay',
      levelId: 228,
      name: "Buford",
      notes: "He only acts okay.",
      tagline: "He only acts okay.",
      portrait: 'assets/patients/28.png',
      mood: { label: 'Antsy', template: 'Flat' },
      vibe: { label: 'Anxious' },
      traits: ['stubborn'],
      quirks: [
        { type: 'SPIRALS', intensityTier: 1 },
        { type: 'AMPED', intensityTier: 1 },
      ],
    },

    // 29
    {
      id: 'nervous_nelly_nails',
      levelId: 229,
      name: "Nervous Nelly",
      notes: "Nails chewed to the quick.",
      tagline: "Nails chewed to the quick.",
      portrait: 'assets/patients/29.png',
      mood: { label: 'Drained', template: 'Flat' },
      vibe: { label: 'Freaking' },
      traits: ['grounded'],
      quirks: [
        { type: 'CRASHES', intensityTier: 2 },
        { type: 'SPIRALS', intensityTier: 2 },
      ],
    },

    // 30
    {
      id: 'hopeless_hal',
      levelId: 230,
      name: "Hopeless Hal",
      notes: "He's lost all hope.",
      tagline: "He's lost all hope.",
      portrait: 'assets/patients/30.png',
      mood: { label: 'Antsy', template: 'Flat' },
      vibe: { label: 'Crisis' },
      traits: [],
      quirks: [
        { type: 'LOCKS_IN', intensityTier: 2 },
        { type: 'AMPED', intensityTier: 2 },
        { type: 'CRASHES', intensityTier: 1 },
      ],
    },

  ];
})();
