// Local dictionary for "اكتب يومك" (write your day): Arabic (fusha + common Hassaniya) and French.
// Words are written naturally here and normalised once when the parser loads (services/search.ts
// normalize: ة→ه, ى→ي, hamzas, no diacritics, lower case, no accents). Loaded with the smart-entry
// screen only — never part of the startup bundle.

/** Category words per built-in category (sysKey). A subcategory wins over its parent when both match. */
export const CATEGORY_WORDS: Record<string, string[]> = {
  // ---- expenses ----
  food: ['طعام', 'اكل', 'أكل', 'ماكله', 'غداء', 'غدا', 'عشاء', 'عشا', 'فطور', 'افطار', 'nourriture', 'repas', 'dejeuner', 'diner', 'manger'],
  groceries: [
    'بقالة', 'حانوت', 'بوتيك', 'بتيك', 'دكان', 'سوق', 'مارشي', 'خبز', 'عيش', 'سكر', 'شاي', 'أتاي', 'اتاي', 'لحم', 'رز', 'أرز', 'زيت',
    'حليب', 'لبن', 'زبده', 'خضرة', 'خضره', 'خضار', 'خضروات', 'فواكه', 'فاكهة', 'طماطم', 'بصل', 'بطاطا', 'بطاطس', 'دجاج', 'سمك', 'حوت',
    'بيض', 'دقيق', 'طحين', 'مكرونة', 'معكرونة', 'عجين', 'نعناع', 'كسكس', 'تمر', 'ملح', 'جبن', 'ماء معدني', 'مشروبات', 'حفاظات', 'صابون',
    'courses', 'pain', 'sucre', 'the', 'viande', 'riz', 'huile', 'lait', 'legumes', 'fruits', 'epicerie', 'boutique', 'supermarche',
    'marche', 'oeufs', 'poisson', 'poulet', 'farine', 'pates', 'menthe', 'savon', 'fromage',
  ],
  restaurants: [
    'مطعم', 'مطاعم', 'سندويش', 'سندوتش', 'ساندويتش', 'شاورما', 'شوارما', 'بيتزا', 'كافيه', 'مقهى', 'قهوة', 'عصير', 'مشوي', 'فطائر',
    'restaurant', 'resto', 'cafe', 'sandwich', 'pizza', 'jus', 'glace',
  ],
  transport: ['نقل', 'مواصلات', 'كار', 'باص', 'حافلة', 'رحلة', 'تذكرة', 'سفر', 'transport', 'bus', 'billet', 'voyage', 'trajet'],
  taxi: ['تاكسي', 'تكسي', 'طاكسي', 'تاكسيات', 'taxi', 'uber', 'yango'],
  fuel: ['بنزين', 'مازوت', 'ديزل', 'وقود', 'ليصانص', 'لسانص', 'غازوال', 'essence', 'gasoil', 'carburant', 'diesel', 'station'],
  phone: [
    'رصيد', 'شحن', 'انترنت', 'إنترنت', 'رصيد انترنت', 'باقة', 'كارت', 'كرت', 'موريتل', 'ماتل', 'شنقيتل', 'شنقيطل', 'ويفي', 'واي فاي',
    'credit', 'recharge', 'internet', 'forfait', 'mattel', 'mauritel', 'chinguitel', 'wifi', 'telephone',
  ],
  rent: ['إيجار', 'ايجار', 'كراء', 'كرا', 'اجار', 'loyer', 'location'],
  utilities: [
    'كهرباء', 'كهربا', 'الضو', 'فاتورة', 'فاتورة الماء', 'فاتورة الكهرباء', 'صوملك', 'غاز', 'بوتاغاز', 'قاز', 'ماء الشبكة',
    'electricite', 'somelec', 'snde', 'gaz', 'facture', 'eau',
  ],
  family: ['عائلة', 'العايلة', 'أهل', 'الاهل', 'الوالدة', 'الوالد', 'أمي', 'ابي', 'أبي', 'أخي', 'اختي', 'أختي', 'الأولاد', 'العيال', 'مصروف البيت', 'famille', 'enfants', 'parents'],
  health: [
    'دواء', 'دوا', 'أدوية', 'ادويه', 'صيدلية', 'فارمسي', 'طبيب', 'دكتور', 'مستشفى', 'سبيطار', 'عيادة', 'تحاليل', 'تحليل', 'علاج', 'أسنان',
    'pharmacie', 'medicament', 'medicaments', 'docteur', 'medecin', 'hopital', 'clinique', 'analyse', 'analyses', 'dentiste',
  ],
  clothes: ['ملابس', 'لباس', 'قميص', 'سروال', 'حذاء', 'نعال', 'نعل', 'دراعة', 'ملحفة', 'خياط', 'خياطة', 'ثوب', 'vetements', 'habits', 'chaussures', 'tailleur', 'chemise', 'pantalon'],
  education: ['مدرسة', 'دروس', 'درس', 'كتب', 'كتاب', 'أقساط', 'جامعة', 'تسجيل', 'محظرة', 'أدوات مدرسية', 'ecole', 'cours', 'livre', 'livres', 'universite', 'fournitures', 'inscription', 'scolarite'],
  charity: ['صدقة', 'صدقات', 'تبرع', 'إحسان', 'sadaqa', 'aumone', 'don'],
  zakat: ['زكاة', 'زكات', 'zakat'],
  fees: ['رسوم', 'رسوم التحويل', 'frais'],
  // ---- income ----
  salary: ['راتب', 'الراتب', 'معاش', 'أجرة', 'اجره', 'مرتب', 'salaire', 'paie'],
  commissions: ['عمولة', 'عمولات', 'كوميسيون', 'commission', 'commissions'],
  services: ['خدمة', 'خدمات', 'شغل', 'مشروع', 'service', 'services', 'prestation', 'mission'],
  gifts: ['هدية', 'هدايا', 'cadeau', 'cadeaux'],
};

/** Aliases for the built-in wallets (sysKey). The wallets' displayed names also match. */
export const WALLET_WORDS: Record<string, string[]> = {
  cash: ['كاش', 'نقد', 'نقدا', 'نقدًا', 'كش', 'الجيب', 'cash', 'espece', 'especes', 'liquide'],
  bankily: ['بنكيلي', 'بنكلي', 'بانكيلي', 'bankily', 'bankili'],
  masrvi: ['مصرفي', 'masrvi', 'masrivi'],
  sedad: ['السداد', 'سداد', 'sedad'],
  bank: ['البنك', 'بنك', 'الحساب', 'حساب بنكي', 'banque', 'compte'],
};

/** Words that make an entry income (verbs of receiving, in Arabic and French). */
export const INCOME_WORDS = [
  'دخلتني', 'دخلني', 'دخلت لي', 'دخل لي', 'وصلني', 'وصلتني', 'وصلتنى', 'جاني', 'جاتني', 'جاوني', 'استلمت', 'تسلمت', 'قبضت', 'ربحت',
  'كسبت', 'اعطاني', 'عطاني', 'اعطتني', 'خلصني', 'خلصوني', 'دفع لي', 'دفعلي', 'حولولي', 'حول لي', 'تحويل وارد', 'مدخول', 'دخل',
  'recu', 'recus', 'touche', 'encaisse', 'gagne', 'rentree', 'versement recu',
];

/** Words that make an entry expense explicitly (so an income category word doesn't flip it). */
export const EXPENSE_WORDS = ['اشتريت', 'شريت', 'اشريت', 'دفعت', 'خلصت', 'صرفت', 'اعطيت', 'عطيت', 'achete', 'paye', 'depense'];

/** Transfer between two of the user's wallets. */
export const TRANSFER_WORDS = ['حولت', 'حوّلت', 'حول', 'تحويل', 'نقلت', 'سحبت', 'virement', 'vire', 'transfere', 'transfert', 'retire'];

/** Debts. lent = the other person owes me; borrowed = I owe them. */
export const DEBT_LENT_WORDS = ['سلفت', 'اسلفت', 'أسلفت', 'سلّفت', 'اقرضت', 'أقرضت', 'دينت', 'prete', 'pret'];
export const DEBT_BORROWED_WORDS = ['تسلفت', 'استلفت', 'اقترضت', 'سلفني', 'اسلفني', 'أسلفني', 'اقرضني', 'أقرضني', 'emprunte', 'emprunt'];

/** Currency words. `old` = old ouguiya (MRO, before 2018): divided by 10. */
export const CURRENCY_WORDS: Record<string, string[]> = {
  BASE: ['أوقية', 'اوقيه', 'أواق', 'اواق', 'اوقيات', 'mru', 'um', 'ouguiya', 'ouguiyas', 'ougiya'],
  OLD: ['قديمة', 'قديم', 'القديمة', 'ancienne', 'anciennes', 'ancien', 'mro'],
  EUR: ['يورو', 'أورو', 'اورو', 'euro', 'euros', 'eur', '€'],
  USD: ['دولار', 'دولارات', 'dollar', 'dollars', 'usd', '$'],
  XOF: ['سيفا', 'فرنك', 'cfa', 'fcfa', 'xof', 'franc', 'francs'],
};

/** Number words → value. `scale` multiplies what comes before (ألف، مليون). */
export const NUMBER_WORDS: Record<string, number> = {
  // units
  'واحد': 1, 'وحده': 1, 'اثنين': 2, 'اثنان': 2, 'ثنين': 2, 'زوز': 2, 'ثلاث': 3, 'ثلاثه': 3, 'تلاته': 3, 'اربع': 4, 'اربعه': 4,
  'خمس': 5, 'خمسه': 5, 'سته': 6, 'سبعه': 7, 'ثمانيه': 8, 'ثمان': 8, 'ثمنيه': 8, 'تسع': 9, 'تسعه': 9, 'عشر': 10, 'عشره': 10,
  'احدعش': 11, 'حداش': 11, 'اثنعش': 12, 'اطناش': 12, 'ثلاثطاش': 13, 'خمسطاش': 15, 'عشرين': 20, 'ثلاثين': 30, 'اربعين': 40,
  'خمسين': 50, 'ستين': 60, 'سبعين': 70, 'ثمانين': 80, 'تسعين': 90,
  // hundreds
  'ميه': 100, 'مائه': 100, 'مايه': 100, 'ميتين': 200, 'مئتين': 200, 'مائتين': 200, 'ميتان': 200,
  'ثلاثميه': 300, 'ثلاثمائه': 300, 'تلتميه': 300, 'اربعميه': 400, 'اربعمائه': 400, 'ربعميه': 400, 'خمسميه': 500, 'خمسمائه': 500,
  'ستميه': 600, 'ستمائه': 600, 'سبعميه': 700, 'سبعمائه': 700, 'ثمانميه': 800, 'ثمنميه': 800, 'ثمانمائه': 800, 'تسعميه': 900, 'تسعمائه': 900,
  // French
  'deux': 2, 'trois': 3, 'quatre': 4, 'cinq': 5, 'six': 6, 'sept': 7, 'huit': 8, 'neuf': 9, 'dix': 10,
  'vingt': 20, 'trente': 30, 'quarante': 40, 'cinquante': 50, 'soixante': 60, 'cent': 100, 'cents': 100,
};
/** Thousands and millions. The dual forms carry their own count (ألفين = 2 × 1000). */
export const SCALE_WORDS: Record<string, { scale: number; count?: number }> = {
  'الف': { scale: 1000 }, 'الاف': { scale: 1000 }, 'الفين': { scale: 1000, count: 2 }, 'الفان': { scale: 1000, count: 2 },
  'مليون': { scale: 1_000_000 }, 'ملايين': { scale: 1_000_000 }, 'مليونين': { scale: 1_000_000, count: 2 },
  'mille': { scale: 1000 }, 'milles': { scale: 1000 }, 'million': { scale: 1_000_000 }, 'millions': { scale: 1_000_000 },
};
/** Units that are also ordinary words: only numbers when part of a compound ("ست مية", "ستة آلاف"). */
export const WEAK_NUMBER_WORDS: Record<string, number> = { 'ست': 6, 'سبع': 7, 'un': 1, 'une': 1 };
export const HALF_WORDS = ['نص', 'نصف', 'demi'];

/** Relative days. */
export const DAY_WORDS: Record<string, number> = {
  'اليوم': 0, 'اليوما': 0, "aujourd'hui": 0, 'aujourdhui': 0, 'today': 0,
  'امس': 1, 'البارح': 1, 'البارحه': 1, 'لبارح': 1, 'hier': 1, 'yesterday': 1,
};
/** Two-word "day before yesterday". */
export const DAY_BEFORE_YESTERDAY = [['اول', 'امس'], ['اول', 'البارح'], ['قبل', 'امس'], ['قبل', 'البارح'], ['avant', 'hier']];
/** Weekday names → JS getDay() (0 = Sunday). The most recent such day is meant (today counts). */
export const WEEKDAY_WORDS: Record<string, number> = {
  'الاحد': 0, 'لحد': 0, 'الاثنين': 1, 'الاتنين': 1, 'لثنين': 1, 'الثلاثاء': 2, 'الثلاثا': 2, 'الثلاث': 2, 'التلات': 2, 'لثلاث': 2,
  'الاربعاء': 3, 'الاربعا': 3, 'لربعاء': 3, 'لاربعا': 3, 'الخميس': 4, 'لخميس': 4, 'الجمعه': 5, 'الجمعة': 5, 'لجمعه': 5, 'السبت': 6, 'لسبت': 6,
  'dimanche': 0, 'lundi': 1, 'mardi': 2, 'mercredi': 3, 'jeudi': 4, 'vendredi': 5, 'samedi': 6,
};

/** Words that carry no meaning of their own here (never shown as "not understood"). */
export const FILLER_WORDS = [
  'و', 'ثم', 'بعدين', 'بعد', 'ذلك', 'كذلك', 'ايضا', 'حتى', 'مع', 'في', 'على', 'من', 'الى', 'إلى', 'ل', 'ب', 'بـ', 'عن', 'يوم', 'انا', 'أنا',
  'لي', 'ليا', 'حق', 'ثمن', 'سعر', 'مبلغ', 'فلوس', 'دراهم', 'بقيمه', 'بمبلغ', 'تقريبا', 'هذا', 'هذه', 'الصباح', 'المساء', 'الليل',
  'et', 'puis', 'aussi', 'de', 'du', 'des', 'le', 'la', 'les', 'l', 'un', 'une', 'pour', 'avec', 'a', 'au', 'aux', 'en', 'par', 'sur', 'vers',
  'j', "j'ai", 'jai', 'ai', 'je', 'mon', 'ma', 'mes', 'ce', 'matin', 'soir', 'chez', 'depuis',
];
/** Prepositions before a wallet: from (source) or to (destination of a transfer). */
export const FROM_WORDS = ['من', 'ب', 'بـ', 'de', 'du', 'depuis', 'par', 'avec'];
export const TO_WORDS = ['ل', 'الى', 'إلى', 'لل', 'في', 'vers', 'a', 'au', 'sur', 'dans'];
