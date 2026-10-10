/*
 * Gym Tracker — «وش يعني»: شرح كل مصطلح في التطبيق (v11.8، G6).
 * لكل مصطلح: عنوان، سطر يلخصه، شرح، مثال من الجيم أو الحياة، وكيف التطبيق يستخدمه. بالعربي والإنجليزي.
 * GymHelp.open('rir') يفتح الصفحة على المصطلح.
 */
(function () {
  'use strict';
  var T = [
    { id: 'rir', group: 'train',
      ar: { t: 'RIR · كم باقي فيك', s: 'كم عدة كان تقدر تسوي زيادة بعد ما وقفت.',
        b: ['بعد ما تخلص الجولة، اسأل نفسك: لو كملت، كم عدة كان أقدر أسوي زيادة بنفس الشكل الصحيح؟ هذا الرقم هو RIR (اختصار Reps In Reserve).', '0 يعني ما كان فيك ولا عدة، وصلت للحد. 1 عدة وحدة بالكثير. 2 عدتين، وهنا أغلب جولات العمل. 3 الوزن بدأ يصير خفيف. 4+ كثير، غالبًا جولة تسخين.'],
        e: 'رفعت بنش 60 كجم 8 مرات، وحسيت إنك تقدر على 2 زيادة بس الثالثة ما تطلع. سجّل RIR 2.',
        a: 'اقتراح اليوم يعتمد عليه: RIR 3 أو أكثر يعني الوزن صار خفيف فيزيده، وRIR 0 يعني وصلت للحد فيثبّته. ما تحب الأرقام؟ فعّل «سهل / مناسب / صعب» من البروفايل.' },
      en: { t: 'RIR · Reps in reserve', s: 'How many more reps you could have done when you stopped.',
        b: ['After a set, ask yourself: if I had kept going, how many more good reps could I have done? That number is RIR (Reps In Reserve).', '0 means nothing left, you hit your limit. 1 means one more at most. 2 means two, where most working sets sit. 3 means the weight is getting light. 4+ is a lot, usually a warm-up.'],
        e: 'You benched 60 kg for 8 and felt you had 2 more, but not a third. Log RIR 2.',
        a: "Today's suggestion depends on it: RIR 3 or more means the weight is light, so it adds weight; RIR 0 means you hit your limit, so it holds. Prefer words? Turn on Easy / Right / Hard in Profile." } },
    { id: '1rm', group: 'train',
      ar: { t: '1RM · أقصى وزن لعدة وحدة', s: 'تقدير لأثقل وزن تقدر ترفعه مرة وحدة.',
        b: ['ما تحتاج ترفع وزن أقصى عشان تعرفه. التطبيق يحسبه من جولاتك العادية بمعادلة معروفة (Epley): كل ما زادت العدات بنفس الوزن، زاد الرقم.', 'فايدته إنه يخليك تقارن جلسات مختلفة: 60 × 10 وبعدها 70 × 5، أيهم أقوى؟ الـ 1RM يقول لك.'],
        e: '60 كجم × 8 عدات ≈ 1RM 76 كجم. لو سويت 62.5 × 8 الأسبوع الجاي، يصير 79: يعني قويت.',
        a: 'التطور ومستوى القوة والأرقام القياسية مبنية عليه. يكون أدق من 1 لـ 10 عدات، وفوق 15 عدة ما يحسبه.' },
      en: { t: '1RM · One-rep max', s: 'An estimate of the heaviest weight you could lift once.',
        b: ['You never need to test a max to know it. The app works it out from your normal sets with a known formula (Epley): more reps with the same weight means a higher number.', 'It lets you compare different sessions: 60 × 10 one week, 70 × 5 the next. Which was stronger? The 1RM tells you.'],
        e: '60 kg × 8 ≈ 1RM 76 kg. If you do 62.5 × 8 next week it becomes 79: you got stronger.',
        a: 'Progress, strength level and records are built on it. Most accurate from 1 to 10 reps; above 15 reps it is not calculated.' } },
    { id: 'volume', group: 'train',
      ar: { t: 'الحجم', s: 'الوزن × العدات لكل جولات العمل.',
        b: ['يقيس كمية الشغل اللي سويته، مو أثقل وزن. جلسة فيها جولات كثيرة بوزن متوسط ممكن يكون حجمها أكبر من جلسة ثقيلة قصيرة.', 'التسخين ما ينحسب. وتمارين الدمبل لكل يد تنحسب لليدين (×2).'],
        e: '60 كجم × 10 عدات × 3 جولات = 1,800 كجم = 1.8 طن.',
        a: 'يطلع في ملخص الجلسة، وتقرير الشهر، وملف Excel.' },
      en: { t: 'Volume', s: 'Weight × reps across your working sets.',
        b: ['It measures how much work you did, not your heaviest lift. Many medium sets can add up to more volume than a short heavy session.', 'Warm-ups do not count. Per-hand dumbbell work counts both hands (×2).'],
        e: '60 kg × 10 reps × 3 sets = 1,800 kg = 1.8 t.',
        a: 'Shown in the session summary, the monthly report and the Excel file.' } },
    { id: 'settype', group: 'train',
      ar: { t: 'أنواع الجولات', s: 'عادية، تسخين، دروب، سوبر.',
        b: ['عادية: جولة العمل الأساسية، تنحسب في كل شي.', 'تسخين: خفيفة تجهز جسمك قبل الثقيل. تبقى في السجل بس ما تنحسب في الحجم ولا الأرقام القياسية ولا التطور.', 'دروب: تخلص جولة، وتنزل الوزن على طول بدون راحة وتكمل. سجّل كل مرحلة جولة لحالها، واختر «بدون مؤقت» بينها.', 'سوبر: تمرينين ورا بعض بدون راحة بينهم. سجّل كل تمرين لحاله.'],
        e: 'سوبر: باي 10 عدات، وعلى طول تراي 10 عدات، وبعدها ترتاح.',
        a: 'نوع الجولة يحدد إذا تنحسب ضمن جولات العمل والأرقام.' },
      en: { t: 'Set types', s: 'Normal, warm-up, drop, superset.',
        b: ['Normal: your main working set; it counts everywhere.', 'Warm-up: a light set before the heavy ones. It stays in the log but does not count in volume, records or progress.', 'Drop set: finish a set, then lower the weight right away and keep going. Log each stage as its own set with no rest timer between.', 'Superset: two exercises back to back with no rest between. Log each one separately.'],
        e: 'Superset: 10 curls, straight into 10 triceps pushdowns, then rest.',
        a: 'The set type decides whether it counts as a working set and towards records.' } },
    { id: 'loadmode', group: 'train',
      ar: { t: 'طريقة الحمل', s: 'كيف ينحسب الوزن اللي تكتبه.',
        b: ['وزن خارجي: بار أو جهاز، الرقم زي ما هو.', 'لكل يد: دمبل، تكتب وزن الدمبل الواحد، والحجم ينحسب لليدين.', 'وزن الجسم: عقلة أو متوازي بدون إضافة. التطبيق يستخدم وزنك من «جسمك».', 'إضافي: وزن جسمك + وزن تربطه (حزام أو دمبل بين رجولك).', 'مساعدة: جهاز العقلة المساعد. المساعدة الأقل = أصعب = تقدّم.', 'بالوقت: بلانك ومثله، تسجل ثواني بدل عدات.'],
        e: 'متوازي ووزنك 80 وربطت 10 كجم: اختر «إضافي» واكتب 10، والتطبيق يحسب 90.',
        a: 'التطبيق يختار الطريقة لحاله حسب التمرين، وتقدر تغيّرها من «إعدادات التمرين».' },
      en: { t: 'Load mode', s: 'How the weight you type is counted.',
        b: ['External: barbell or machine, the number as is.', 'Per hand: dumbbells; type one dumbbell and volume counts both hands.', 'Bodyweight: pull-ups or dips with nothing added; the app uses your weight from Body.', 'Added: your bodyweight + what you strap on.', 'Assisted: the assisted pull-up machine. Less assistance = harder = progress.', 'Timed: planks and the like, logged in seconds instead of reps.'],
        e: 'Dips at 80 kg bodyweight with 10 kg strapped on: choose Added and type 10; the app counts 90.',
        a: 'The app picks the mode for each exercise; change it in Exercise settings.' } },
    { id: 'suggestion', group: 'train',
      ar: { t: 'اقتراح اليوم', s: 'الوزن والعدات اللي تجرب عليها اليوم، مع السبب.',
        b: ['يشوف أفضل جولة في آخر جلسة لنفس التمرين، ويقرر حسب RIR: لو كان باقي فيك كثير يزيد الوزن، لو باقي عدة أو عدتين يزيد عدة، ولو وصلت للحد يثبّت.', 'لما توصل 12 عدة يزيد الوزن ويرجعك 8 عدات وتبني من جديد.'],
        e: 'آخر مرة 60 × 10 وRIR 3 → اليوم 62.5 × 10.',
        a: 'في وضع رمضان يثبّت الأرقام بدل ما يزيدها. ولو قوتك ثابتة 3 جلسات يعطيك جلسة أخف.' },
      en: { t: "Today's suggestion", s: 'The weight and reps to try today, with the reason.',
        b: ['It looks at your best set last session for the same exercise and decides from RIR: plenty left means add weight, one or two left means add a rep, none left means hold.', 'Once you reach 12 reps it adds weight and drops you back to 8 to build up again.'],
        e: 'Last time 60 × 10 at RIR 3 → today 62.5 × 10.',
        a: 'In Ramadan mode it holds your numbers. If your strength stalls for 3 sessions it offers a lighter session.' } },
    { id: 'plateau', group: 'train',
      ar: { t: 'الثبات', s: 'لما قوتك ما تتحسن 3 جلسات أو أكثر.',
        b: ['طبيعي يصير لأي أحد. غالبًا السبب تعب متراكم، أو نوم قليل، أو أكل أقل من حاجتك.', 'الحل المجرّب: جلسة أخف (أقل 10% بنفس العدات) تخلي جسمك يرتاح، وبعدها ترجع لوزنك وتكسر الرقم.'],
        e: 'بنش 70 × 8 ثلاث جلسات ورا بعض بدون زيادة → جلسة 62.5 × 8 → الجلسة اللي بعدها 70 × 9.',
        a: 'يطلع تنبيه في اقتراح اليوم مع زر «جلسة خفيفة».' },
      en: { t: 'Plateau', s: 'When your strength has not improved for 3+ sessions.',
        b: ['It happens to everyone. Usually accumulated fatigue, too little sleep or too little food.', 'The proven fix: one lighter session (10% less, same reps) lets your body recover, then go back to your weight and beat it.'],
        e: 'Bench stuck at 70 × 8 for three sessions → one session at 62.5 × 8 → next time 70 × 9.',
        a: "A note shows in today's suggestion with a Light session button." } },
    { id: 'recovery', group: 'train',
      ar: { t: 'الاستشفاء', s: 'كم تحتاج العضلة راحة قبل ما تتمرن عليها بقوة.',
        b: ['العضلة تقوى وهي ترتاح، مو وهي تتمرن. كل ما زادت جولاتك عليها، احتاجت راحة أطول.', 'التطبيق يقدّر: 1–4 جولات تحتاج يوم ونص، 5–9 يومين، و10 أو أكثر 3 أيام. النوم والأكل يفرقون.'],
        e: 'سويت 12 جولة أرجل يوم الأحد → جاهزة تقريبًا الأربعاء.',
        a: 'خريطة الاستشفاء في «جسمك»، وسطر منها في خطة الجلسة وشاشة «ابدأ».' },
      en: { t: 'Recovery', s: 'How long a muscle needs before you train it hard again.',
        b: ['Muscles grow while resting, not while training. The more sets you did, the longer they need.', 'The app estimates: 1–4 sets need a day and a half, 5–9 two days, 10 or more three days. Sleep and food matter.'],
        e: '12 sets of legs on Sunday → about ready on Wednesday.',
        a: 'The recovery map is in Body, with a summary line in the session plan and the start screen.' } },
    { id: 'strength', group: 'train',
      ar: { t: 'مستوى القوة', s: 'قوتك مقارنة بوزن جسمك.',
        b: ['يقسم 1RM حقك على وزنك ويقارنه بمعايير منتشرة للرجال والنساء: بداية، مبتدئ، متوسط، متقدم، نخبة.', 'تقريبي: العمر وسنين التمرين يفرقون.'],
        e: 'وزنك 80 وبنشك 1RM 100 → 1.25× وزنك = متوسط. باقي 20 كجم لمتقدم.',
        a: 'يطلع في «التطور» للسكوات والبنش والديدليفت وضغط الأكتاف.' },
      en: { t: 'Strength level', s: 'Your strength relative to your bodyweight.',
        b: ['It divides your 1RM by your weight and compares it with common standards for men and women: starting, beginner, intermediate, advanced, elite.', 'Approximate: age and training years matter.'],
        e: '80 kg bodyweight, bench 1RM 100 → 1.25× = intermediate, 20 kg to advanced.',
        a: 'Shown in Progress for squat, bench, deadlift and overhead press.' } },
    { id: 'muscle-sets', group: 'train',
      ar: { t: 'الجولات لكل عضلة', s: 'كم جولة عمل سويت لكل عضلة هالأسبوع.',
        b: ['كل تمرين ينحسب لعضلته الأساسية بس: البنش للصدر، حتى لو التراي اشتغل معه.', 'أغلب الناس يتطورون بين 10 و20 جولة للعضلة بالأسبوع.'],
        e: 'بنش 4 جولات + تفتيح 3 = 7 جولات صدر.',
        a: 'العضلة تنحدد من التمرين، وتقدر تغيّرها للتمارين اللي أضفتها.' },
      en: { t: 'Sets per muscle', s: 'Working sets per muscle this week.',
        b: ['Each exercise counts only for its main muscle: bench goes to chest even though triceps help.', 'Most people progress with 10 to 20 sets per muscle per week.'],
        e: '4 sets of bench + 3 of flyes = 7 chest sets.',
        a: 'The muscle comes from the exercise; you can change it for exercises you added.' } },
    { id: 'calories-burn', group: 'train',
      ar: { t: 'سعرات التمرين', s: 'تقدير للحرق في الجلسة.',
        b: ['الحديد: التطبيق يحسب للجلسة كاملة من مدتها ووزنك (معادلة MET)، وبعدها يقسمها على التمارين حسب عدد جولات كل تمرين.', 'الكارديو: من السرعة والميل أو الشدة والمدة ووزنك.', 'كل هذا تقديري. الساعات الذكية بعد تقدّر.'],
        e: 'جلسة حديد ساعة ووزنك 80 ≈ 280 سعرة. السكوات فيها 5 من 20 جولة → ≈ 70 سعرة.',
        a: 'يطلع جنب كل تمرين في سجل اليوم، وفي ملخص الجلسة.' },
      en: { t: 'Workout calories', s: 'An estimate of what the session burned.',
        b: ['Weights: the app estimates the whole session from its length and your weight (MET formula), then splits it across exercises by their number of sets.', 'Cardio: from speed and incline or intensity, duration and your weight.', 'All of it is an estimate; smart watches estimate too.'],
        e: 'An hour of weights at 80 kg ≈ 280 kcal. Squats were 5 of 20 sets → ≈ 70 kcal.',
        a: "Shown next to each exercise in today's log and in the session summary." } },
    { id: 'tdee', group: 'body',
      ar: { t: 'TDEE · سعرات المحافظة', s: 'كم سعرة يحرق جسمك في يوم كامل.',
        b: ['يشمل كل شي: وأنت نايم، وأنت تمشي، وأنت تتمرن. لو أكلت نفس الرقم، وزنك يبقى تقريبًا ثابت.', 'ينحسب من BMR (حرقك وأنت مرتاح) مضروب في مستوى نشاطك.'],
        e: 'رقمك 2,600: تبي تنشف؟ كل حوالي 2,100. تبي تضخم؟ حوالي 2,850.',
        a: 'تقديري: راقب وزنك أسبوعين وعدّل لو لزم. في رمضان ينقسم على الفطور والسحور.' },
      en: { t: 'TDEE · Maintenance calories', s: 'How many calories your body burns in a whole day.',
        b: ['It covers everything: sleeping, walking, training. Eat that number and your weight stays about the same.', 'Worked out as BMR (your burn at rest) times your activity level.'],
        e: 'Yours is 2,600: cutting? Eat about 2,100. Bulking? About 2,850.',
        a: 'An estimate: watch your weight for two weeks and adjust. In Ramadan it is split between iftar and suhoor.' } },
    { id: 'bmr', group: 'body',
      ar: { t: 'BMR · حرقك وأنت مرتاح', s: 'السعرات اللي يحتاجها جسمك بدون أي حركة.',
        b: ['لو قعدت طول اليوم على الكنب، جسمك يحرق هذا الرقم عشان قلبك ونفسك ودماغك.', 'ينحسب من وزنك وطولك وعمرك وجنسك (معادلة Mifflin-St Jeor).'],
        e: 'رجل 80 كجم، 178 سم، 28 سنة ≈ 1,780 سعرة.',
        a: 'أساس حساب سعرات المحافظة.' },
      en: { t: 'BMR · Burn at rest', s: 'Calories your body needs without any movement.',
        b: ['Spend the day on the sofa and your body still burns this for your heart, breathing and brain.', 'Worked out from weight, height, age and sex (Mifflin-St Jeor).'],
        e: 'A man of 80 kg, 178 cm, 28 years ≈ 1,780 kcal.',
        a: 'The base for maintenance calories.' } },
    { id: 'bmi', group: 'body',
      ar: { t: 'BMI · مؤشر كتلة الجسم', s: 'وزنك ÷ (طولك بالمتر)².',
        b: ['أقل من 18.5 نحيف، 18.5–24.9 طبيعي، 25–29.9 فوق الطبيعي، 30 وفوق عالي.', 'ما يفرق بين العضل والدهون، فاللي عنده عضل كثير يطلع رقمه عالي وهو مو سمين.'],
        e: '82.5 كجم و178 سم → 82.5 ÷ 3.17 = 26.',
        a: 'نسبة الخصر للطول أدق منه لدهون البطن، فشوفهم مع بعض.' },
      en: { t: 'BMI · Body mass index', s: 'Your weight ÷ (height in metres)².',
        b: ['Under 18.5 underweight, 18.5–24.9 normal, 25–29.9 overweight, 30+ high.', 'It cannot tell muscle from fat, so very muscular people score high without being fat.'],
        e: '82.5 kg and 178 cm → 82.5 ÷ 3.17 = 26.',
        a: 'Waist-to-height is better for belly fat, so read them together.' } },
    { id: 'whtr', group: 'body',
      ar: { t: 'نسبة الخصر للطول', s: 'محيط خصرك ÷ طولك.',
        b: ['أقل من 0.5 ممتاز، 0.5–0.6 انتبه، فوق 0.6 عالي.', 'تقيس دهون البطن، وهي أهم شي صحيًا. قيس الخصر عند السرة الصبح قبل الأكل.'],
        e: 'خصر 88 سم وطول 178 → 0.49 ممتاز.',
        a: 'تحتاج تسجل خصرك في «جسمك».' },
      en: { t: 'Waist-to-height', s: 'Your waist ÷ your height.',
        b: ['Under 0.5 great, 0.5–0.6 watch it, above 0.6 high.', 'It tracks belly fat, the part that matters most for health. Measure at the navel in the morning before eating.'],
        e: 'Waist 88 cm, height 178 → 0.49, great.',
        a: 'Needs your waist logged in Body.' } },
    { id: 'bodyfat', group: 'body',
      ar: { t: 'نسبة الدهون والعضل والماء', s: 'من جهاز قياس الجسم.',
        b: ['أجهزة الجيم والموازين الذكية تقدّرها. الرقم يتغير مع الماء والأكل، فقيس بنفس الوقت دايم.', 'للرجال 10–20% دهون طبيعي ورياضي، وللنساء 18–28%.'],
        e: 'قيس كل أسبوعين الصبح قبل الأكل، وقارن الاتجاه مو الرقم الواحد.',
        a: 'اختياري. لو أدخلته، التطبيق يحسب مؤشر العضل.' },
      en: { t: 'Body fat, muscle and water', s: 'From a body-composition scale.',
        b: ['Gym machines and smart scales estimate them. The numbers move with water and food, so always measure at the same time.', 'For men 10–20% fat is normal to athletic, for women 18–28%.'],
        e: 'Measure every two weeks in the morning before eating, and compare the trend, not one reading.',
        a: 'Optional. If you enter it, the app works out the muscle index.' } },
    { id: 'ffmi', group: 'body',
      ar: { t: 'FFMI · مؤشر العضل', s: 'وزنك بدون دهون نسبة لطولك.',
        b: ['يشبه BMI بس يحسب العضل والعظم بس. يبين كم بنيت عضل.', '18–20 متوسط، 20–22 فوق المتوسط، 22–25 عضلي، فوق 25 نادر بدون منشطات.'],
        e: '82.5 كجم و18% دهون و178 سم → حوالي 21.3.',
        a: 'يحتاج نسبة الدهون.' },
      en: { t: 'FFMI · Muscle index', s: 'Your fat-free weight relative to your height.',
        b: ['Like BMI, but only counting muscle and bone. It shows how much muscle you have built.', '18–20 average, 20–22 above average, 22–25 muscular, above 25 rare without drugs.'],
        e: '82.5 kg at 18% fat and 178 cm → about 21.3.',
        a: 'Needs body fat.' } }
  ];
  function lang() { return window.GymI18n && window.GymI18n.lang === 'en' ? 'en' : 'ar'; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var back = null;

  function render(openId) {
    var box = document.getElementById('help-list');
    if (!box) return;
    var L = lang(), q = (document.getElementById('help-search') || {}).value || '';
    var norm = function (s) { return window.GymData && GymData.normalizeText ? GymData.normalizeText(s) : String(s).toLowerCase(); };
    box.replaceChildren();
    var groups = [['train', L === 'en' ? 'Training' : 'التمرين'], ['body', L === 'en' ? 'Your body' : 'جسمك']];
    groups.forEach(function (g) {
      var items = T.filter(function (x) {
        if (x.group !== g[0]) return false;
        if (!q.trim()) return true;
        var d = x[L], all = [d.t, d.s].concat(d.b).join(' ');
        return norm(all).indexOf(norm(q)) >= 0 || (x.id === 'rir' && /rir/i.test(q));
      });
      if (!items.length) return;
      box.appendChild(el('h2', 'help-group', g[1]));
      items.forEach(function (x) {
        var d = x[L];
        var det = document.createElement('details'); det.className = 'help-item'; det.id = 'help-' + x.id;
        if (x.id === openId) det.open = true;
        var sum = el('summary'); sum.append(el('b', null, d.t), el('span', null, d.s));
        det.appendChild(sum);
        var body = el('div', 'help-body');
        d.b.forEach(function (p) { body.appendChild(el('p', null, p)); });
        var ex = el('p', 'help-example'); ex.append(el('b', null, L === 'en' ? 'Example: ' : 'مثال: '), document.createTextNode(d.e)); body.appendChild(ex);
        var ap = el('p', 'help-app'); ap.append(el('b', null, L === 'en' ? 'In the app: ' : 'في التطبيق: '), document.createTextNode(d.a)); body.appendChild(ap);
        det.appendChild(body);
        box.appendChild(det);
      });
    });
    if (!box.children.length) box.appendChild(el('p', 'field-hint', L === 'en' ? 'Nothing matches.' : 'ما فيه مصطلح بهالاسم.'));
  }
  function open(id) {
    var screen = document.getElementById('screen-help');
    if (!screen) return;
    var cur = document.querySelector('.screen-content:not(.hidden)');
    back = cur && cur.id !== 'screen-help' ? cur.id.replace('screen-', '') : (back || 'workout');
    var s = document.getElementById('help-search'); if (s) s.value = '';
    render(id);
    document.querySelectorAll('.screen-content').forEach(function (x) { x.classList.add('hidden'); });
    screen.classList.remove('hidden');
    window.scrollTo(0, 0);
    var target = id && document.getElementById('help-' + id);
    if (target) { target.scrollIntoView({ block: 'start' }); window.scrollBy(0, -12); target.querySelector('summary').focus(); }
    else { var h = document.getElementById('help-title'); if (h) h.focus(); }
  }
  function close() {
    var nav = document.getElementById('nav-' + (back || 'workout'));
    if (nav) nav.click(); else document.getElementById('screen-help').classList.add('hidden');
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-help]');
    if (b) { e.preventDefault(); open(b.dataset.help); return; }
    if (e.target.closest && e.target.closest('#help-back')) close();
  });
  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'help-search') render(null); });
  window.GymHelp = { open: open, close: close, ids: function () { return T.map(function (x) { return x.id; }); }, get: function (id) { var x = T.find(function (y) { return y.id === id; }); return x ? x[lang()] : null; } };
})();
