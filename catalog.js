/* Gym Tracker — الثوابت: مكتبة التمارين، القوائم الجاهزة، والتسميات. منقولة كما هي من app.js. */
(() => {
'use strict';
const ROUTINE_PRESETS = {
            ppl_push: ['ex_1', 'ex_2', 'ex_4', 'ex_12', 'ex_15', 'ex_20'],
            ppl_pull: ['ex_24', 'ex_26', 'ex_27', 'ex_38', 'ex_40'],
            ppl_legs: ['ex_44', 'ex_47', 'ex_49', 'ex_50', 'ex_58'],
            ul_upper: ['ex_1', 'ex_24', 'ex_12', 'ex_26', 'ex_15', 'ex_38'],
            ul_lower: ['ex_44', 'ex_52', 'ex_47', 'ex_49', 'ex_50', 'ex_58']
        };
const EXERCISE_DICTIONARY = {
            'hip adduction': { cat: 'legs', equip: 'machine' },
            'hip abduction': { cat: 'legs', equip: 'machine' },
            'adduction': { cat: 'legs', equip: 'machine' },
            'abduction': { cat: 'legs', equip: 'machine' },
            'hip thrust': { cat: 'legs', equip: 'machine' },
            'leg press': { cat: 'legs', equip: 'machine' },
            'leg extension': { cat: 'legs', equip: 'machine' },
            'leg curl': { cat: 'legs', equip: 'machine' },
            'squat': { cat: 'legs', equip: 'barbell' },
            'hack squat': { cat: 'legs', equip: 'machine' },
            'goblet squat': { cat: 'legs', equip: 'dumbbell' },
            'bulgarian split squat': { cat: 'legs', equip: 'dumbbell' },
            'rdl': { cat: 'legs', equip: 'barbell' },
            'romanian deadlift': { cat: 'legs', equip: 'barbell' },
            'deadlift': { cat: 'legs', equip: 'barbell' },
            'calf raise': { cat: 'legs', equip: 'machine' },
            'lunge': { cat: 'legs', equip: 'dumbbell' },
            'bench press': { cat: 'push', equip: 'barbell' },
            'incline bench press': { cat: 'push', equip: 'barbell' },
            'incline dumbbell press': { cat: 'push', equip: 'dumbbell' },
            'dumbbell press': { cat: 'push', equip: 'dumbbell' },
            'chest press': { cat: 'push', equip: 'machine' },
            'shoulder press': { cat: 'push', equip: 'dumbbell' },
            'overhead press': { cat: 'push', equip: 'barbell' },
            'lateral raise': { cat: 'push', equip: 'dumbbell' },
            'tricep pushdown': { cat: 'push', equip: 'cable_body' },
            'dips': { cat: 'push', equip: 'cable_body' },
            'pec deck': { cat: 'push', equip: 'machine' },
            'lat pulldown': { cat: 'pull', equip: 'machine' },
            'seated cable row': { cat: 'pull', equip: 'cable_body' },
            'bent over row': { cat: 'pull', equip: 'barbell' },
            'dumbbell row': { cat: 'pull', equip: 'dumbbell' },
            'pull up': { cat: 'pull', equip: 'cable_body' },
            'bicep curl': { cat: 'pull', equip: 'dumbbell' },
            'hammer curl': { cat: 'pull', equip: 'dumbbell' },
            'face pull': { cat: 'pull', equip: 'cable_body' },
            'shrugs': { cat: 'pull', equip: 'dumbbell' }
        };
const DEFAULT_EXERCISES = [
            { id: 'ex_1', name: 'بنش بريس مستوي بالبار (Barbell Bench Press)', category: 'push', type: 'weights', equip: 'barbell' },
            { id: 'ex_2', name: 'بنش بريس مائل بالبار (Incline Barbell Bench Press)', category: 'push', type: 'weights', equip: 'barbell' },
            { id: 'ex_3', name: 'ضغط صدر بالدمبل مستوي (Flat Dumbbell Bench Press)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_4', name: 'ضغط صدر بالدمبل مائل (Incline Dumbbell Bench Press)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_5', name: 'ضغط صدر بالدمبل سفلي (Decline Dumbbell Press)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_6', name: 'تفتيح صدر بالدمبل (Dumbbell Flyes)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_7', name: 'ضغط صدر بالماكينة (Chest Press Machine)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_8', name: 'ضغط صدر مائل بالماكينة (Incline Chest Press Machine)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_9', name: 'تفتيح صدر جهاز الفراشة (Pec Deck / Fly Machine)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_10', name: 'سحب كيبل متقاطع للصدر (Cable Crossover)', category: 'push', type: 'weights', equip: 'cable_body' },
            { id: 'ex_11', name: 'ضغط أكتاف بالبار واقف (Overhead Barbell Press)', category: 'push', type: 'weights', equip: 'barbell' },
            { id: 'ex_12', name: 'ضغط أكتاف بالدمبل جالس (Seated Dumbbell Shoulder Press)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_13', name: 'ضغط أكتاف أرنولد (Arnold Press)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_14', name: 'ضغط أكتاف ماكينة (Shoulder Press Machine)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_15', name: 'رفرفة أكتاف جانبي بالدمبل (Dumbbell Lateral Raise)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_16', name: 'رفرفة أكتاف جانبي كيبل (Cable Lateral Raise)', category: 'push', type: 'weights', equip: 'cable_body' },
            { id: 'ex_17', name: 'رفرفة أكتاف جانبي جهاز (Lateral Raise Machine)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_18', name: 'رفرفة أمامي بالدمبل (Dumbbell Front Raise)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_19', name: 'متوازي (Dips)', category: 'push', type: 'weights', equip: 'cable_body' },
            { id: 'ex_20', name: 'تمديد ترايسيبس بالكيبل (Cable Triceps Pushdown)', category: 'push', type: 'weights', equip: 'cable_body' },
            { id: 'ex_21', name: 'ترايسيبس كيبل بالحبل (Rope Triceps Pushdown)', category: 'push', type: 'weights', equip: 'cable_body' },
            { id: 'ex_22', name: 'ترايسيبس بالدمبل خلف الرأس (Dumbbell Overhead Extension)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_23', name: 'ترايسيبس كيك باك بالدمبل (Dumbbell Kickbacks)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_24', name: 'سحب ظهر عريض عالي (Lat Pulldown Machine)', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_25', name: 'سحب ظهر قبضة ضيقة (Close-Grip Lat Pulldown)', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_26', name: 'سحب ظهر أرضي كيبل (Seated Cable Row)', category: 'pull', type: 'weights', equip: 'cable_body' },
            { id: 'ex_27', name: 'سحب ظهر فردي بالدمبل (Single-Arm Dumbbell Row)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_28', name: 'سحب ظهر بالبار (Barbell Bent-Over Row)', category: 'pull', type: 'weights', equip: 'barbell' },
            { id: 'ex_29', name: 'جهاز T-Bar Row', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_30', name: 'جهاز سحب ظهر علوي (High Row Machine)', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_31', name: 'عقلة (Pull-ups / Chin-ups)', category: 'pull', type: 'weights', equip: 'cable_body' },
            { id: 'ex_32', name: 'جهاز العقلة المساعد (Assisted Pull-Up Machine)', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_33', name: 'بلوفر بالدمبل (Dumbbell Pullover)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_34', name: 'رفرفة أكتاف خلفي جهاز (Reverse Pec Deck)', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_35', name: 'رفرفة خلفي بالدمبل (Rear Delt Dumbbell Fly)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_36', name: 'سحب كيبل للوجه - أكتاف خلفية (Cable Face Pull)', category: 'pull', type: 'weights', equip: 'cable_body' },
            { id: 'ex_37', name: 'هز أكتاف / ترابيس بالدمبل (Dumbbell Shrugs)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_38', name: 'مرجحة بايسبس بالبار (Barbell Biceps Curl)', category: 'pull', type: 'weights', equip: 'barbell' },
            { id: 'ex_39', name: 'مرجحة بايسبس بالدمبل (Dumbbell Biceps Curl)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_40', name: 'مرجحة بايسبس هامر / مطرقة (Dumbbell Hammer Curl)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_41', name: 'مرجحة بايسبس على بنش مائل (Incline Dumbbell Curl)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_42', name: 'مرجحة بايسبس بالكيبل (Cable Biceps Curl)', category: 'pull', type: 'weights', equip: 'cable_body' },
            { id: 'ex_43', name: 'مرجحة بايسبس تركيز (Concentration Curl)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_44', name: 'سكوات بالبار (Barbell Squat)', category: 'legs', type: 'weights', equip: 'barbell' },
            { id: 'ex_45', name: 'سكوات على جهاز السميث (Smith Machine Squat)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_46', name: 'هاك سكوات ماكينة (Hack Squat Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_47', name: 'مكبس أرجل (Leg Press Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_48', name: 'سكوات كوب بالدمبل (Dumbbell Goblet Squat)', category: 'legs', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_49', name: 'جهاز تمديد الأرجل أمامي (Leg Extension Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_50', name: 'جهاز ثني الأرجل خلفي جالس (Seated Leg Curl)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_51', name: 'جهاز ثني الأرجل خلفي مستلقي (Lying Leg Curl)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_52', name: 'ديدليفت روماني بالبار (Barbell RDL)', category: 'legs', type: 'weights', equip: 'barbell' },
            { id: 'ex_53', name: 'ديدليفت روماني بالدمبل (Dumbbell RDL)', category: 'legs', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_54', name: 'طعن / لانجز بالدمبل (Dumbbell Lunges)', category: 'legs', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_55', name: 'سكوات بلغاري بالدمبل (Bulgarian Split Squat)', category: 'legs', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_56', name: 'جهاز ضم وإبعاد الفخذ (Abductor / Adductor Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_57', name: 'جهاز هيب ثرست للمقعدة (Hip Thrust Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_58', name: 'جهاز سمانة واقف (Standing Calf Raise Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_59', name: 'جهاز سمانة جالس (Seated Calf Raise Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_60', name: 'طحن معدة (Crunches)', category: 'abs', type: 'weights', equip: 'cable_body' },
            { id: 'ex_61', name: 'رفع الأرجل معلق (Hanging Leg Raise)', category: 'abs', type: 'weights', equip: 'cable_body' },
            { id: 'ex_62', name: 'تمرين البلانك (Plank)', category: 'abs', type: 'weights', equip: 'cable_body' },
            { id: 'ex_63', name: 'طحن معدة بالكيبل (Cable Crunch)', category: 'abs', type: 'weights', equip: 'cable_body' },
            { id: 'ex_64', name: 'جهاز المشي (Treadmill)', category: 'cardio', type: 'treadmill', equip: 'cardio' },
            { id: 'ex_65', name: 'دراجة تمارين ثابتة (Stationary Bike)', category: 'cardio', type: 'bike_elliptical', equip: 'cardio' },
            { id: 'ex_66', name: 'جهاز الغزالة / أوبتكال (Elliptical Trainer)', category: 'cardio', type: 'bike_elliptical', equip: 'cardio' },
            { id: 'ex_67', name: 'جهاز سلالم الدرج (Stair Master)', category: 'cardio', type: 'bike_elliptical', equip: 'cardio' },
            { id: 'ex_68', name: 'جهاز التجديف (Rowing Machine)', category: 'cardio', type: 'bike_elliptical', equip: 'cardio' },
            { id: 'ex_69', name: 'دراجة هوائية (Air Bike)', category: 'cardio', type: 'bike_elliptical', equip: 'cardio' },
            // v12.7: the deadlift joins the library, plus more machines, cables and free-weight moves (user study)
            { id: 'ex_70', name: 'ديدليفت بالبار (Barbell Deadlift)', category: 'legs', type: 'weights', equip: 'barbell' },
            { id: 'ex_71', name: 'ضغط صدر بالسميث (Smith Machine Bench Press)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_72', name: 'ضغط صدر مائل بالسميث (Incline Smith Machine Press)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_73', name: 'بنش بريس سفلي بالبار (Decline Barbell Bench Press)', category: 'push', type: 'weights', equip: 'barbell' },
            { id: 'ex_74', name: 'تفتيح صدر بالكيبل من تحت لفوق (Low-to-High Cable Fly)', category: 'push', type: 'weights', equip: 'cable_body' },
            { id: 'ex_75', name: 'ضغط صدر جهاز أقراص (Plate-Loaded Chest Press)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_76', name: 'ضغط صدر سفلي بالماكينة (Decline Chest Press Machine)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_77', name: 'ضغط أرضي (Push-ups)', category: 'push', type: 'weights', equip: 'cable_body' },
            { id: 'ex_78', name: 'ضغط أكتاف بالسميث (Smith Machine Shoulder Press)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_79', name: 'رفرفة أمامي بالكيبل (Cable Front Raise)', category: 'push', type: 'weights', equip: 'cable_body' },
            { id: 'ex_80', name: 'سحب للذقن بالكيبل (Cable Upright Row)', category: 'push', type: 'weights', equip: 'cable_body' },
            { id: 'ex_81', name: 'رفرفة خلفي بالكيبل (Cable Rear Delt Fly)', category: 'pull', type: 'weights', equip: 'cable_body' },
            { id: 'ex_82', name: 'ضغط أكتاف لاندماين (Landmine Press)', category: 'push', type: 'weights', equip: 'barbell' },
            { id: 'ex_83', name: 'هز أكتاف بالبار (Barbell Shrugs)', category: 'pull', type: 'weights', equip: 'barbell' },
            { id: 'ex_84', name: 'سكل كراشر بالبار (EZ-Bar Skull Crusher)', category: 'push', type: 'weights', equip: 'barbell' },
            { id: 'ex_85', name: 'ترايسيبس كيبل فوق الرأس (Cable Overhead Triceps Extension)', category: 'push', type: 'weights', equip: 'cable_body' },
            { id: 'ex_86', name: 'بنش بريس قبضة ضيقة (Close-Grip Bench Press)', category: 'push', type: 'weights', equip: 'barbell' },
            { id: 'ex_87', name: 'جهاز متوازي جالس (Seated Dip Machine)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_88', name: 'جهاز تمديد الترايسيبس (Triceps Extension Machine)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_89', name: 'مرجحة بايسبس بار EZ (EZ-Bar Curl)', category: 'pull', type: 'weights', equip: 'barbell' },
            { id: 'ex_90', name: 'جهاز بايسبس الواعظ (Preacher Curl Machine)', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_91', name: 'مرجحة الواعظ ببار EZ (EZ-Bar Preacher Curl)', category: 'pull', type: 'weights', equip: 'barbell' },
            { id: 'ex_92', name: 'مرجحة هامر بالكيبل والحبل (Cable Rope Hammer Curl)', category: 'pull', type: 'weights', equip: 'cable_body' },
            { id: 'ex_93', name: 'مرجحة عكسية بالبار (Reverse Barbell Curl)', category: 'pull', type: 'weights', equip: 'barbell' },
            { id: 'ex_94', name: 'مرجحة الرسغ بالدمبل (Dumbbell Wrist Curl)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_95', name: 'ديدليفت سومو (Sumo Deadlift)', category: 'legs', type: 'weights', equip: 'barbell' },
            { id: 'ex_96', name: 'ديدليفت بالبار السداسي (Trap Bar Deadlift)', category: 'legs', type: 'weights', equip: 'barbell' },
            { id: 'ex_97', name: 'جهاز سحب ظهر صدر مسنود (Chest-Supported Row Machine)', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_98', name: 'جهاز سحب ظهر منخفض (Low Row Machine)', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_99', name: 'سحب ظهر فردي بالكيبل (Single-Arm Cable Row)', category: 'pull', type: 'weights', equip: 'cable_body' },
            { id: 'ex_100', name: 'سحب ذراع مستقيم بالكيبل (Straight-Arm Cable Pulldown)', category: 'pull', type: 'weights', equip: 'cable_body' },
            { id: 'ex_101', name: 'سحب ظهر بالدمبل صدر على بنش مائل (Chest-Supported Dumbbell Row)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_102', name: 'جهاز تمديد الظهر (Back Extension / Hyperextension)', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_103', name: 'جهاز البلوفر (Pullover Machine)', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_104', name: 'جهاز سحب ظهر بالأقراص (Plate-Loaded Lat Pulldown)', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_105', name: 'سكوات أمامي بالبار (Barbell Front Squat)', category: 'legs', type: 'weights', equip: 'barbell' },
            { id: 'ex_106', name: 'هيب ثرست بالبار (Barbell Hip Thrust)', category: 'legs', type: 'weights', equip: 'barbell' },
            { id: 'ex_107', name: 'جهاز سكوات البندول (Pendulum Squat Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_108', name: 'جهاز سكوات الحزام (Belt Squat Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_109', name: 'مكبس أرجل أفقي (Horizontal Leg Press)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_110', name: 'جهاز رفس المقعدة (Glute Kickback Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_111', name: 'رفس المقعدة بالكيبل برجل وحدة (Single-Leg Cable Kickback)', category: 'legs', type: 'weights', equip: 'cable_body' },
            { id: 'ex_112', name: 'جهاز ثني الأرجل واقف برجل وحدة (Single-Leg Standing Leg Curl)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_113', name: 'طلوع على بوكس بالدمبل (Dumbbell Step-Up)', category: 'legs', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_114', name: 'سمانة على مكبس الأرجل (Leg Press Calf Raise)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_115', name: 'جهاز الفخذ الخلفي والمقعدة (Glute-Ham Raise)', category: 'legs', type: 'weights', equip: 'cable_body' },
            { id: 'ex_116', name: 'سكوات سومو بالدمبل (Dumbbell Sumo Squat)', category: 'legs', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_117', name: 'جهاز ضم الفخذ (Hip Adductor Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_118', name: 'جهاز إبعاد الفخذ (Hip Abductor Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_119', name: 'جهاز البطن (Ab Crunch Machine)', category: 'abs', type: 'weights', equip: 'machine' },
            { id: 'ex_120', name: 'دوران الجذع بالكيبل (Cable Woodchopper)', category: 'abs', type: 'weights', equip: 'cable_body' },
            { id: 'ex_121', name: 'عجلة البطن (Ab Wheel Rollout)', category: 'abs', type: 'weights', equip: 'cable_body' },
            { id: 'ex_122', name: 'بلانك جانبي (Side Plank)', category: 'abs', type: 'weights', equip: 'cable_body' },
            { id: 'ex_123', name: 'رفع الأرجل على الكرسي الروماني (Captain\'s Chair Leg Raise)', category: 'abs', type: 'weights', equip: 'machine' },
            { id: 'ex_124', name: 'جهاز التزلج (SkiErg)', category: 'cardio', type: 'bike_elliptical', equip: 'cardio', machine: 'rowing' },
            { id: 'ex_125', name: 'دراجة سبين (Spin Bike)', category: 'cardio', type: 'bike_elliptical', equip: 'cardio', machine: 'bike' },
            { id: 'ex_126', name: 'دراجة بظهر مسنود (Recumbent Bike)', category: 'cardio', type: 'bike_elliptical', equip: 'cardio', machine: 'bike' }
        ];
const CATEGORY_NAMES = { push: 'دفع', pull: 'سحب', legs: 'أرجل', abs: 'بطن', cardio: 'كارديو' };
const EQUIP_NAMES = { barbell: 'بار', dumbbell: 'دمبل', machine: 'أجهزة', cable_body: 'كابل/وزن جسم', cardio: 'كارديو' };
const ROUTINE_LABELS = {
            free: 'جلسة حرة', ppl_push: 'دفع (Push)', ppl_pull: 'سحب (Pull)',
            ppl_legs: 'أرجل (Legs)', ul_upper: 'علوي (Upper)', ul_lower: 'سفلي (Lower)'
        };
const LOAD_HINTS = {
                external: 'يسجل الوزن المدخل كما هو ويستخدمه في القوة والحجم.',
                per_hand: 'الرقم هو وزن الدمبل الواحد؛ الحجم التدريبي يحسب اليدين ×2.',
                bodyweight: 'يستخدم وزن جسمك من البروفايل. خانة الوزن يمكن تركها صفرًا.',
                added: 'أدخل الوزن الإضافي فقط؛ الحمل الفعلي = وزن الجسم + الوزن الإضافي.',
                assisted: 'أدخل مقدار المساعدة؛ التقدم يتحسن عندما تقل المساعدة.',
                timed: 'للبلانك والتمارين الزمنية؛ يسجل الثواني بدل العدات ولا يحسب 1RM.'
            };
const SET_LABELS = {normal:'عادية',warmup:'تسخين',dropset:'دروب',drop:'دروب',superset:'سوبر',failure:'فشل (سجل سابق)'};
const SET_HELP = {normal:'جولة العمل الأساسية بوزن وعدات تختارها. تُحسب ضمن جولات العمل.',warmup:'جولة خفيفة للتحضير. تبقى في السجل وتُستبعد من جولات العمل ومنحنى التطور.',dropset:'تخفض الوزن بعد جولة وتكمل العدات. سجّل كل مرحلة وحدها، واختر «بدون مؤقت» بين المراحل.',superset:'تمرينان متتاليان بدون راحة بينهما. سجّل كل تمرين وحده، واختر «بدون مؤقت» حتى تنتهي منهما.',failure:'تصنيف محفوظ من نسخة سابقة. استخدم RIR 0 عند تسجيل جولة جديدة وصلت فيها للفشل.'};
// v10.8 — العضلة الأساسية لكل تمرين (للحجم الأسبوعي). التمارين المركبة تنحسب لعضلتها الأساسية بس.
// v11.7: الباي والتراي عضلتين مختلفتين (كانت «ذراع» وحدة)
const MUSCLE_NAMES = { chest: 'صدر', back: 'ظهر', shoulders: 'أكتاف', biceps: 'باي', triceps: 'تراي', legs: 'أرجل', abs: 'بطن' };
const MUSCLE_BY_ID = {};
const assign = (m, ids) => ids.forEach(n => { MUSCLE_BY_ID['ex_' + n] = m; });
assign('chest', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 19]);
assign('shoulders', [11, 12, 13, 14, 15, 16, 17, 18, 34, 35, 36]);
assign('triceps', [20, 21, 22, 23]);
assign('biceps', [38, 39, 40, 41, 42, 43]);
MUSCLE_BY_ID.ex_70 = 'back'; // ديدليفت بالبار (ينضاف مع البرامج)
assign('back', [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 37]);
assign('legs', [44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59]);
assign('abs', [60, 61, 62, 63]);
// v12.7
assign('chest', [71, 72, 73, 74, 75, 76, 77]);
assign('shoulders', [78, 79, 80, 81, 82]);
assign('back', [83, 97, 98, 99, 100, 101, 102, 103, 104]);
assign('triceps', [84, 85, 86, 87, 88]);
assign('biceps', [89, 90, 91, 92, 93, 94]);
assign('legs', [95, 96, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118]);
assign('abs', [119, 120, 121, 122, 123]);
/* v12 (M1/M2): العضلات بالتفصيل. كل عضلة تابعة لمجموعة من السبع (MUSCLE_NAMES) اللي تبقى في باقي التطبيق.
 * PARTS = كل العضلات المرسومة. اللي في EXTRA_PARTS (M6–M11) ما تطلع إلا لو انفعّلت، وغير كذا تنضم لعضلة أكبر (PART_MERGE). */
const PARTS = {
 chest_up: { ar: 'صدر علوي', en: 'Upper chest', g: 'chest' }, chest_low: { ar: 'صدر سفلي', en: 'Lower chest', g: 'chest' },
 serratus: { ar: 'السيراتوس', en: 'Serratus', g: 'chest', extra: 1 },
 traps: { ar: 'الترابيس', en: 'Traps', g: 'back' }, lats: { ar: 'المجنص (اللات)', en: 'Lats', g: 'back' },
 midback: { ar: 'وسط الظهر', en: 'Mid back', g: 'back' }, lowback: { ar: 'أسفل الظهر', en: 'Lower back', g: 'back' },
 delt_f: { ar: 'كتف أمامي', en: 'Front delts', g: 'shoulders' }, delt_s: { ar: 'كتف جانبي', en: 'Side delts', g: 'shoulders' }, delt_r: { ar: 'كتف خلفي', en: 'Rear delts', g: 'shoulders' },
 biceps: { ar: 'الباي', en: 'Biceps', g: 'biceps' },
 bi_long: { ar: 'الباي الخارجي', en: 'Biceps long head', g: 'biceps', extra: 1 }, bi_short: { ar: 'الباي الداخلي', en: 'Biceps short head', g: 'biceps', extra: 1 },
 brachialis: { ar: 'عضلة الذراع الجانبية', en: 'Brachialis', g: 'biceps', extra: 1 },
 forearm: { ar: 'الساعد', en: 'Forearms', g: 'biceps' },
 triceps: { ar: 'التراي', en: 'Triceps', g: 'triceps' },
 tri_long: { ar: 'التراي الطويل', en: 'Triceps long head', g: 'triceps', extra: 1 }, tri_lat: { ar: 'التراي الجانبي', en: 'Triceps lateral head', g: 'triceps', extra: 1 },
 abs: { ar: 'البطن', en: 'Abs', g: 'abs' },
 abs_up: { ar: 'البطن العلوي', en: 'Upper abs', g: 'abs', extra: 1 }, abs_low: { ar: 'البطن السفلي', en: 'Lower abs', g: 'abs', extra: 1 },
 obliques: { ar: 'الخواصر', en: 'Obliques', g: 'abs' },
 quads: { ar: 'الفخذ الأمامي', en: 'Quads', g: 'legs' }, hams: { ar: 'الفخذ الخلفي', en: 'Hamstrings', g: 'legs' }, glutes: { ar: 'الأرداف', en: 'Glutes', g: 'legs' },
 adductors: { ar: 'الفخذ الداخلي', en: 'Inner thigh', g: 'legs' }, abductors: { ar: 'الفخذ الخارجي', en: 'Outer thigh', g: 'legs', extra: 1 },
 calves: { ar: 'السمانة', en: 'Calves', g: 'legs' },
 gastro: { ar: 'السمانة الكبيرة', en: 'Calves (gastrocnemius)', g: 'legs', extra: 1 }, soleus: { ar: 'السمانة العميقة', en: 'Calves (soleus)', g: 'legs', extra: 1 }
};
// لو العضلة الزيادة مو مفعّلة تنضم لهذي (null = تنشال)
const PART_MERGE = { serratus: null, bi_long: 'biceps', bi_short: 'biceps', brachialis: 'biceps', tri_long: 'triceps', tri_lat: 'triceps', abs_up: 'abs', abs_low: 'abs', abductors: 'glutes', gastro: 'calves', soleus: 'calves' };
// والعكس: العضلة الكبيرة لما تتفصّل
const PART_SPLIT = { biceps: ['bi_long', 'bi_short', 'brachialis'], triceps: ['tri_long', 'tri_lat'], abs: ['abs_up', 'abs_low'], calves: ['gastro', 'soleus'] };
// المفعّلة
const EXTRA_PARTS = ['serratus', 'bi_long', 'bi_short', 'brachialis', 'tri_long', 'tri_lat', 'abs_up', 'abs_low', 'abductors', 'gastro', 'soleus']; // M6–M11 كلها موافق عليها
// كل تمرين: «أساسية | مساعدة» بالعضلات المفصّلة. الأساسية = جولة كاملة، المساعدة = نص جولة
const PARTS_BY_ID = {};
const pm = (n, spec) => { const [m, h = ''] = spec.split('|'); PARTS_BY_ID['ex_' + n] = { main: m.trim().split(/\s+/).filter(Boolean), help: h.trim().split(/\s+/).filter(Boolean) }; };
[[1, 'chest_low | chest_up delt_f tri_lat tri_long'], [2, 'chest_up | delt_f tri_lat chest_low'], [3, 'chest_low | chest_up delt_f tri_lat'], [4, 'chest_up | delt_f tri_lat'],
 [5, 'chest_low | tri_lat'], [6, 'chest_low chest_up | delt_f'], [7, 'chest_low | chest_up delt_f tri_lat'], [8, 'chest_up | delt_f tri_lat'], [9, 'chest_low chest_up | delt_f'], [10, 'chest_low | chest_up delt_f'],
 [11, 'delt_f | delt_s tri_long tri_lat chest_up traps serratus'], [12, 'delt_f | delt_s tri_lat tri_long'], [13, 'delt_f delt_s | tri_lat'], [14, 'delt_f | delt_s tri_lat'],
 [15, 'delt_s | traps'], [16, 'delt_s | traps'], [17, 'delt_s | traps'], [18, 'delt_f | chest_up'], [19, 'chest_low tri_lat | tri_long delt_f'],
 [20, 'tri_lat | tri_long'], [21, 'tri_lat | tri_long'], [22, 'tri_long | tri_lat'], [23, 'tri_lat tri_long'],
 [24, 'lats | midback bi_long bi_short brachialis delt_r'], [25, 'lats | midback bi_short brachialis'], [26, 'midback lats | delt_r bi_long brachialis traps'],
 [27, 'lats midback | delt_r bi_long brachialis'], [28, 'midback lats | delt_r lowback bi_long brachialis forearm traps'], [29, 'midback lats | delt_r lowback brachialis'],
 [30, 'lats midback | delt_r bi_long'], [31, 'lats | midback bi_long bi_short brachialis forearm delt_r'], [32, 'lats | midback bi_short brachialis'], [33, 'lats | chest_low serratus tri_long'],
 [34, 'delt_r | midback traps'], [35, 'delt_r | midback traps'], [36, 'delt_r | traps midback'], [37, 'traps | forearm'],
 [38, 'bi_long bi_short | brachialis forearm'], [39, 'bi_long bi_short | brachialis forearm'], [40, 'brachialis | bi_long forearm'], [41, 'bi_long | bi_short brachialis'],
 [42, 'bi_short bi_long | brachialis'], [43, 'bi_short | bi_long brachialis'],
 [44, 'quads glutes | adductors lowback hams'], [45, 'quads glutes | adductors'], [46, 'quads | glutes adductors'], [47, 'quads glutes | adductors hams'], [48, 'quads glutes | adductors lowback'],
 [49, 'quads'], [50, 'hams | gastro'], [51, 'hams | gastro'], [52, 'hams glutes | lowback forearm adductors'], [53, 'hams glutes | lowback forearm'],
 [54, 'quads glutes | adductors hams abductors'], [55, 'quads glutes | adductors abductors hams'], [56, 'adductors abductors'], [57, 'glutes | hams abductors'],
 [58, 'gastro | soleus'], [59, 'soleus | gastro'], [60, 'abs_up | obliques abs_low'], [61, 'abs_low | abs_up obliques forearm'], [62, 'abs_up abs_low | obliques delt_f'], [63, 'abs_up | abs_low obliques'],
 [70, 'lowback glutes hams | traps lats forearm quads midback'],
 // v12.7
 [71, 'chest_low | chest_up delt_f tri_lat'],
 [72, 'chest_up | delt_f tri_lat'],
 [73, 'chest_low | tri_lat delt_f'],
 [74, 'chest_up | delt_f'],
 [75, 'chest_low | chest_up delt_f tri_lat'],
 [76, 'chest_low | tri_lat'],
 [77, 'chest_low | chest_up delt_f tri_lat abs'],
 [78, 'delt_f | delt_s tri_lat'],
 [79, 'delt_f | chest_up'],
 [80, 'delt_s | traps delt_f'],
 [81, 'delt_r | midback traps'],
 [82, 'delt_f | chest_up tri_lat serratus'],
 [83, 'traps | forearm'],
 [84, 'tri_long tri_lat'],
 [85, 'tri_long | tri_lat'],
 [86, 'tri_lat tri_long | chest_low delt_f'],
 [87, 'tri_lat | chest_low tri_long delt_f'],
 [88, 'tri_lat tri_long'],
 [89, 'bi_long bi_short | brachialis forearm'],
 [90, 'bi_short | bi_long brachialis'],
 [91, 'bi_short | bi_long brachialis'],
 [92, 'brachialis | bi_long forearm'],
 [93, 'brachialis forearm | bi_long'],
 [94, 'forearm'],
 [95, 'glutes quads adductors | hams lowback traps forearm'],
 [96, 'quads glutes hams | lowback traps forearm'],
 [97, 'midback lats | delt_r bi_long brachialis'],
 [98, 'lats midback | delt_r bi_long brachialis'],
 [99, 'lats midback | delt_r bi_long brachialis'],
 [100, 'lats | tri_long serratus'],
 [101, 'midback lats | delt_r bi_long brachialis'],
 [102, 'lowback | glutes hams'],
 [103, 'lats | serratus tri_long'],
 [104, 'lats | midback bi_long brachialis delt_r'],
 [105, 'quads | glutes adductors abs'],
 [106, 'glutes | hams adductors'],
 [107, 'quads | glutes adductors'],
 [108, 'quads glutes | adductors'],
 [109, 'quads glutes | adductors hams'],
 [110, 'glutes | hams'],
 [111, 'glutes | hams abductors'],
 [112, 'hams | gastro'],
 [113, 'quads glutes | adductors hams'],
 [114, 'gastro | soleus'],
 [115, 'hams | glutes gastro'],
 [116, 'quads glutes adductors'],
 [117, 'adductors'],
 [118, 'abductors | glutes'],
 [119, 'abs_up | abs_low obliques'],
 [120, 'obliques | abs_up abs_low'],
 [121, 'abs_up abs_low | obliques lats'],
 [122, 'obliques | abs_up abs_low'],
 [123, 'abs_low | abs_up obliques']].forEach(([n, spec]) => pm(n, spec));
// v12.7: how a new library exercise is logged when it isn't the usual for its equipment (dumbbell = per hand, the rest = the weight as entered)
const DEFAULT_LOAD = { ex_77: 'bodyweight', ex_102: 'bodyweight', ex_115: 'bodyweight', ex_116: 'external', ex_121: 'bodyweight', ex_122: 'timed', ex_123: 'bodyweight' };
window.GymCatalog = Object.freeze({ DEFAULT_LOAD, MUSCLE_NAMES, PARTS, PART_MERGE, PART_SPLIT, EXTRA_PARTS, PARTS_BY_ID, MUSCLE_BY_ID, ROUTINE_PRESETS, EXERCISE_DICTIONARY, DEFAULT_EXERCISES, CATEGORY_NAMES, EQUIP_NAMES, ROUTINE_LABELS, LOAD_HINTS, SET_LABELS, SET_HELP });
})();
