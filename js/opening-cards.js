// Opening screen: picks a fact, joke, book, song, word, idiom or tiny challenge.
// Loaded as a plain script so it runs before the rest of the app.
(function () {
  window.__splashStart = Date.now();
  // Opening card deck: [kind, main, sub, extra]
  var FACT = [
    "Octopuses have three hearts and blue blood.",
    "Botanically, bananas are berries but strawberries are not.",
    "A day on Venus (243 Earth days) is longer than its year (225 Earth days).",
    "Wombats produce cube-shaped poop.",
    "Sharks have been around longer than trees: roughly 450 million years versus about 385 million.",
    "Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid.",
    "Teaching at Oxford began before the Aztec capital Tenochtitlan was even founded.",
    "Python is named after Monty Python's Flying Circus, not the snake.",
    "SQL was created at IBM in the 1970s and was first called SEQUEL.",
    "A modern Excel sheet has 1,048,576 rows and 16,384 columns (A to XFD).",
    "In 1947 engineers found a real moth stuck in the Harvard Mark II computer and taped it in the logbook as the first actual “bug”.",
    "The Pomodoro Technique is named after the tomato-shaped kitchen timer Francesco Cirillo used as a student.",
    "Your brain is about 2% of your body weight but uses around 20% of its energy.",
    "Spacing out your revision over several days beats cramming the same hours into one night. It's called the spacing effect.",
    "Sleep after studying helps your brain lock in what you learned that day.",
    "A group of flamingos is called a flamboyance.",
    "Sea otters often hold hands while they sleep so they don't drift apart.",
    "Sunlight takes about 8 minutes and 20 seconds to reach Earth, so you always see the Sun as it was 8 minutes ago.",
    "There are more possible games of chess than atoms in the observable universe.",
    "The word “robot” comes from the Czech “robota” (forced labour), first used in Karel Čapek's 1920 play R.U.R.",
    "The Petronas Twin Towers were the tallest buildings in the world from 1998 to 2004.",
    "Durians aren't allowed on Singapore's MRT because of their smell.",
    "Tardigrades (water bears) have survived exposure to the vacuum of space.",
    "A bolt of lightning is about five times hotter than the surface of the Sun.",
    "The Great Wall of China can't be seen with the naked eye from the Moon.",
    "The QWERTY keyboard layout dates back to typewriters of the 1870s.",
    "Indian mathematician Brahmagupta wrote rules for calculating with zero in 628 CE.",
    "Koalas can sleep up to around 20 hours a day.",
    "The cells lining your stomach are replaced every few days.",
    "Honey hardly ever spoils: still-edible honey has been found in ancient Egyptian tombs.",
    "Butterflies taste with their feet.",
    "Hummingbirds are the only birds that can fly backwards.",
    "A jiffy is a real unit: in physics it's sometimes used for the time light takes to travel one centimetre.",
    "The dot over a lowercase i or j is called a tittle.",
    "Cows have best friends and get stressed when they're separated.",
    "Venus is the only planet in our solar system that spins clockwise.",
  ];
  var JOKE = [
    ["Why do programmers prefer dark mode?", "Because light attracts bugs."],
    ["A SQL query walks into a bar, goes up to two tables and asks…", "“Can I join you?”"],
    ["Why was the maths book sad?", "It had too many problems."],
    ["I'm reading a book about anti-gravity.", "It's impossible to put down."],
    ["Why don't scientists trust atoms?", "They make up everything."],
    ["What do you call a fake noodle?", "An impasta."],
    ["There are 10 types of people in the world.", "Those who understand binary and those who don't."],
    ["Why did the developer go broke?", "They used up all their cache."],
    ["I'd tell you a UDP joke…", "but you might not get it."],
    ["What do you call a bear with no teeth?", "A gummy bear."],
    ["I only know 25 letters of the alphabet.", "I don't know y."],
    ["Why did the scarecrow win an award?", "He was outstanding in his field."],
    ["Why do Java developers wear glasses?", "Because they don't C#."],
    ["I tried to catch fog yesterday.", "Mist."],
    ["Why can't you trust stairs?", "They're always up to something."],
    ["Time flies like an arrow.", "Fruit flies like a banana."],
    ["What did the ocean say to the beach?", "Nothing, it just waved."],
    ["Why did the coffee file a police report?", "It got mugged."],
    ["What's the object-oriented way to become wealthy?", "Inheritance."],
    ["Parallel lines have so much in common.", "It's a shame they'll never meet."],
    ["My to-do list and I have a lot in common.", "We both keep getting longer."],
    ["Debugging is like being the detective in a crime movie…", "where you're also the murderer."],
    ["Why did the student eat his homework?", "The teacher said it was a piece of cake."],
    ["What's a computer's favourite snack?", "Microchips."],
    ["Why did the spreadsheet feel so confident?", "It had all its cells in order."],
    ["What do you call a sleeping dinosaur?", "A dino-snore."],
    ["Why are frogs so happy?", "They eat whatever bugs them."],
    ["How do you comfort a JavaScript bug?", "You console it."],
  ];
  var BOOK = [
    [
      "Atomic Habits",
      "James Clear",
      "Tiny daily habits compound into big results. Pairs well with your routine and streaks.",
    ],
    ["Deep Work", "Cal Newport", "How to focus without distraction. Try it with the focus timer."],
    [
      "Four Thousand Weeks",
      "Oliver Burkeman",
      "A refreshingly honest take on time management: you can't do everything, so choose well.",
    ],
    ["Storytelling with Data", "Cole Nussbaumer Knaflic", "Turn spreadsheets into clear charts people understand."],
    [
      "Naked Statistics",
      "Charles Wheelan",
      "Statistics explained with humour and real examples, no heavy maths needed.",
    ],
    ["Ultralearning", "Scott H. Young", "How to teach yourself hard skills fast. Great for self-study courses."],
    [
      "The Pragmatic Programmer",
      "David Thomas & Andrew Hunt",
      "Practical habits that make you a better developer, whatever language you use.",
    ],
    ["Range", "David Epstein", "Why being curious about many things can beat specialising too early."],
    [
      "The Psychology of Money",
      "Morgan Housel",
      "Short stories about saving, risk and patience. A good first-job read.",
    ],
    ["Project Hail Mary", "Andy Weir", "A science-packed space adventure that's funny and hard to put down."],
    ["Klara and the Sun", "Kazuo Ishiguro", "A gentle, thoughtful novel told by an AI companion."],
    ["The Midnight Library", "Matt Haig", "A woman gets to try the lives she didn't choose. Cosy and reflective."],
    [
      "Tomorrow, and Tomorrow, and Tomorrow",
      "Gabrielle Zevin",
      "Two friends make video games together over thirty years.",
    ],
    [
      "Before the Coffee Gets Cold",
      "Toshikazu Kawaguchi",
      "A small Tokyo café where you can travel back in time, briefly.",
    ],
    ["Educated", "Tara Westover", "A memoir about learning your way into a completely different life."],
    [
      "The Little Prince",
      "Antoine de Saint-Exupéry",
      "Short enough for one evening, and it means something new at every age.",
    ],
    [
      "《三体》 The Three-Body Problem",
      "刘慈欣 Liu Cixin",
      "Mind-bending Chinese science fiction about first contact.",
    ],
    [
      "《被讨厌的勇气》 The Courage to Be Disliked",
      "岸见一郎 · 古贺史健",
      "A conversation about living by your own values instead of others' expectations.",
    ],
    ["《活着》 To Live", "余华 Yu Hua", "A moving novel about endurance and finding meaning through hardship."],
  ];
  var SONG = [
    ["晴天", "周杰伦 Jay Chou", "A nostalgic classic for a sunny commute."],
    ["江南", "林俊杰 JJ Lin", "Soft and dreamy, good for winding down."],
    ["光年之外", "邓紫棋 G.E.M.", "Big, cinematic and full of energy."],
    ["倎强", "五月天 Mayday", "For when you need a push to keep going."],
    ["遇见", "孙燕姿 Stefanie Sun", "Calm and warm, a perfect slow morning song."],
    ["稳稳的幸福", "陈奕迅 Eason Chan", "Gentle and comforting after a long day."],
    ["爱人错过", "告五人 Accusefive", "Upbeat indie rock to wake you up."],
    ["Here Comes the Sun", "The Beatles", "Instant good mood, guaranteed."],
    ["Lovely Day", "Bill Withers", "A feel-good start to any day."],
    ["Good Days", "SZA", "Floaty and relaxed, nice for an easy afternoon."],
    ["Put Your Records On", "Corinne Bailey Rae", "Breezy and sunny, good for chores."],
    ["Banana Pancakes", "Jack Johnson", "The ultimate lazy-weekend-morning song."],
    ["Riptide", "Vance Joy", "Light ukulele pop to hum along to."],
    ["Dreams", "Fleetwood Mac", "A timeless groove for a calm evening."],
    ["Electric Feel", "MGMT", "Funky and fun, good for tidying up."],
    ["Golden Hour", "JVKE", "Sweeping and romantic, made for sunsets."],
    ["Weightless", "Marconi Union", "Ambient and calm. Try it during a focus session."],
    ["Clair de Lune", "Claude Debussy", "Quiet piano for reading or studying."],
    ["Gymnopédie No. 1", "Erik Satie", "Slow, gentle piano for a peaceful start."],
    ["Viva la Vida", "Coldplay", "Big strings and a big chorus for a motivation boost."],
    ["As It Was", "Harry Styles", "Bouncy pop for a walk."],
    ["Levitating", "Dua Lipa", "Disco energy for a workout."],
  ];
  var WORD = [
    ["Petrichor", "noun", "The earthy smell when rain falls on dry ground."],
    ["Komorebi 木漏れ日", "Japanese", "Sunlight filtering through the leaves of trees."],
    ["Tsundoku 積ん読", "Japanese", "Buying books and letting them pile up unread."],
    ["Sobremesa", "Spanish", "Lingering at the table chatting after a meal is finished."],
    ["Hiraeth", "Welsh", "A deep longing for home, or for a place you can't return to."],
    ["Hygge", "Danish", "A cosy, comfortable feeling of contentment."],
    ["Lagom", "Swedish", "Not too much, not too little: just the right amount."],
    ["Ikigai 生き甲斐", "Japanese", "Your reason for getting up in the morning."],
    ["Wabi-sabi", "Japanese", "Finding beauty in things that are imperfect and impermanent."],
    ["Kintsugi 金継ぎ", "Japanese", "Repairing broken pottery with gold, making the cracks part of its story."],
    ["Shinrin-yoku 森林浴", "Japanese", "“Forest bathing”: spending calm time among trees."],
    ["Saudade", "Portuguese", "A bittersweet longing for something or someone you love."],
    ["Serendipity", "noun", "Finding something good by happy accident."],
    ["Apricity", "noun", "The warmth of the sun on a cold day."],
    ["Defenestration", "noun", "The act of throwing something (or someone) out of a window."],
    ["Gigil", "Filipino", "The urge to squeeze something unbearably cute."],
    [
      "Mamihlapinatapai",
      "Yaghan",
      "A look shared between two people who both want something but neither wants to start.",
    ],
  ];
  var IDIOM = [
    ["画蛇添足", "huà shé tiān zú", "Drawing legs on a snake: ruining something by overdoing it."],
    [
      "守株待兔",
      "shǒu zhū dài tù",
      "Waiting by a tree stump for another rabbit to crash into it: hoping for luck instead of working.",
    ],
    ["对牛弹琴", "duì niú tán qín", "Playing the zither to a cow: talking to the wrong audience."],
    ["井底之蛙", "jǐng dǐ zhī wā", "A frog at the bottom of a well: someone with a narrow view of the world."],
    ["亡羊补牢", "wáng yáng bǔ láo", "Mending the pen after losing a sheep: it's never too late to fix things."],
    ["塞翁失马", "sài wēng shī mǎ", "The old man lost his horse: a setback may turn out to be a blessing."],
    ["胸有成竹", "xiōng yǒu chéng zhú", "Having the bamboo already in mind before painting it: being well prepared."],
    ["狐假虎威", "hú jiǎ hǔ wēi", "The fox borrows the tiger's power: bluffing with someone else's authority."],
    [
      "叶公好龙",
      "yè gōng hào lóng",
      "Lord Ye loved dragons until a real one showed up: liking something only in theory.",
    ],
    ["水滴石穿", "shuǐ dī shí chuān", "Dripping water wears through stone: small steady effort wins."],
  ];
  var DARE = [
    "Drink a full glass of water before your first coffee.",
    "Write down one thing you're looking forward to this week.",
    "Do the smallest task on your list first, right now.",
    "Put your phone in another room for one focus session.",
    "Send a quick message to a friend you haven't talked to in a while.",
    "Take a 10-minute walk without your earphones.",
    "Tidy your desk for two minutes before you start.",
    "Stand up and stretch every time you finish a task today.",
    "Explain one thing you learned yesterday out loud, as if teaching it.",
    "Go to bed 20 minutes earlier tonight.",
    "Eat one extra portion of fruit or vegetables today.",
    "Say thank you to someone and mention exactly what they did.",
  ];
  var pool = [];
  FACT.forEach(function (x) {
    pool.push({ k: "fact", main: x });
  });
  JOKE.forEach(function (x) {
    pool.push({ k: "joke", main: x[0], sub: x[1] });
  });
  BOOK.forEach(function (x) {
    pool.push({ k: "book", main: x[0], by: x[1], sub: x[2] });
  });
  SONG.forEach(function (x) {
    pool.push({ k: "song", main: x[0], by: x[1], sub: x[2] });
  });
  WORD.forEach(function (x) {
    pool.push({ k: "word", main: x[0], by: x[1], sub: x[2] });
  });
  IDIOM.forEach(function (x) {
    pool.push({ k: "idiom", main: x[0], by: x[1], sub: x[2] });
  });
  DARE.forEach(function (x) {
    pool.push({ k: "dare", main: x });
  });
  var LABEL = {
    fact: "Did you know?",
    joke: "Joke of the day",
    book: "Book pick",
    song: "Song pick",
    word: "Word to know",
    idiom: "成语 Idiom",
    dare: "Tiny challenge",
  };
  var KINDS = ["fact", "joke", "book", "song", "word", "idiom", "dare"];
  var d = new Date(),
    seen = [],
    lastK = "";
  try {
    seen = JSON.parse(localStorage.getItem("daybook-cards") || "[]");
    lastK = localStorage.getItem("daybook-card-kind") || "";
  } catch (e) {}
  function pickCard() {
    var ks = KINDS.filter(function (k) {
        return k !== lastK;
      }),
      k = ks[Math.floor(Math.random() * ks.length)];
    var opts = pool.filter(function (c) {
      return c.k === k && seen.indexOf(c.main) < 0;
    });
    if (!opts.length) {
      seen = seen.filter(function (m) {
        return !pool.some(function (c) {
          return c.k === k && c.main === m;
        });
      });
      opts = pool.filter(function (c) {
        return c.k === k;
      });
    }
    var c = opts[Math.floor(Math.random() * opts.length)];
    seen.push(c.main);
    if (seen.length > 120) seen = seen.slice(-120);
    lastK = k;
    try {
      localStorage.setItem("daybook-cards", JSON.stringify(seen));
      localStorage.setItem("daybook-card-kind", k);
    } catch (e) {}
    return c;
  }
  var $id = function (i) {
    return document.getElementById(i);
  };
  function show(c) {
    var fig = document.querySelector(".sp-quote");
    fig.className = "sp-quote k-" + c.k;
    var kind = $id("sp-kind"),
      q = $id("sp-q"),
      tr = $id("sp-tr"),
      a = $id("sp-a"),
      lk = $id("sp-link");
    kind.hidden = false;
    kind.textContent = LABEL[c.k];
    q.textContent = c.main;
    a.textContent = c.by || "";
    a.hidden = !c.by;
    tr.textContent = c.sub || "";
    tr.hidden = !c.sub;
    tr.classList.remove("reveal");
    lk.hidden = c.k !== "song";
    if (c.k === "song")
      lk.href =
        "https://open.spotify.com/search/" +
        encodeURIComponent(c.main + " " + c.by.replace(/[\u4e00-\u9fff]+/g, "").trim());
    if (c.k === "joke") {
      clearTimeout(show._t);
      show._t = setTimeout(function () {
        tr.classList.add("reveal");
      }, 1400);
    }
    var len = (c.main + (c.sub || "")).length;
    window.__splashMin = Math.min(6000, 2600 + len * 28 + (c.k === "joke" ? 1200 : 0));
  }
  show(pickCard());
  $id("sp-next").addEventListener("click", function (e) {
    e.stopPropagation();
    show(pickCard());
    window.__splashStart = Date.now();
    window.__splashHold = true;
    $id("sp-hint").textContent = "Tap anywhere to continue";
  });
  $id("sp-link").addEventListener("click", function (e) {
    e.stopPropagation();
  });

  document.getElementById("sp-date").textContent = d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
})();
