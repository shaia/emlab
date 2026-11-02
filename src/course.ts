/**
 * The course map: every chapter and every planned lesson, written or not.
 *
 * Written lessons live in src/content/lessons as MDX; this list is the order and the
 * promise. The table of contents shows planned lessons as "coming soon", so the student
 * always sees the whole road (Ministry syllabus, 5 units, Bagrut paper 036371), plus one
 * bridge chapter beyond the Bagrut that leads into first-year university E&M.
 */

export interface PlannedLesson {
  id: string;
  title: string;
}

export interface Chapter {
  n: number;
  title: string;
  /** one line under the chapter title on the contents page */
  blurb: string;
  /** syllabus hours, from the Ministry programme */
  hours?: number;
  /** above the Bagrut: not in the syllabus, labelled so on the contents page and in its lessons */
  beyondBagrut?: boolean;
  lessons: PlannedLesson[];
}

export const chapters: Chapter[] = [
  {
    n: 0,
    title: 'יוצאים לדרך',
    blurb: 'איך לומדים בקורס, וארגז הכלים שכל פרק משתמש בו.',
    lessons: [
      { id: '0.1', title: 'איך לומדים בקורס הזה' },
      { id: '0.2', title: 'ארגז כלים: וקטורים וכיוונים במרחב' },
      { id: '0.3', title: 'יחידות, כתיב מדעי והצגת פתרון' },
      { id: '0.4', title: 'גרפים וליניאריזציה' },
    ],
  },
  {
    n: 1,
    title: 'חוק קולון והשדה החשמלי',
    blurb: 'מטען, כוח חשמלי, ומה שממלא את המרחב סביב מטען.',
    hours: 15,
    lessons: [
      { id: '1.1', title: 'מטען חשמלי' },
      { id: '1.2', title: 'טעינה: חיכוך, מגע והשראה' },
      { id: '1.3', title: 'חוק קולון' },
      { id: '1.4', title: 'סופרפוזיציה של כוחות' },
      { id: '1.5', title: 'השדה החשמלי' },
      { id: '1.6', title: 'קווי שדה' },
      { id: '1.7', title: 'שטף וחוק גאוס' },
      { id: '1.8', title: 'יישומי חוק גאוס' },
      { id: '1.9', title: 'מוליכים בשיווי משקל' },
      { id: '1.10', title: 'תנועת מטען בשדה אחיד' },
      { id: '1.11', title: 'חזרה: מהניסוי לתאוריה' },
    ],
  },
  {
    n: 2,
    title: 'פוטנציאל וקבלים',
    blurb: 'אנרגיה, מתח, ואיך אוגרים מטען.',
    hours: 14,
    lessons: [
      { id: '2.1', title: 'עבודה ואנרגיה פוטנציאלית' },
      { id: '2.2', title: 'פוטנציאל חשמלי' },
      { id: '2.3', title: 'משטחים שווי פוטנציאל' },
      { id: '2.4', title: 'שימור אנרגיה בתנועת מטען' },
      { id: '2.5', title: 'מוליך כדורי והארקה' },
      { id: '2.6', title: 'קבל לוחות' },
      { id: '2.7', title: 'אנרגיה בקבל' },
      { id: '2.8', title: 'קבלים בטור ובמקביל' },
      { id: '2.9', title: 'חזרה: מהניסוי לתאוריה' },
    ],
  },
  {
    n: 3,
    title: 'מעגלי זרם ישר',
    blurb: 'מתח שדוחף, זרם שזורם, ונורות שמספרות סיפור.',
    hours: 25,
    lessons: [
      { id: '3.1', title: 'מתח: מפוטנציאל לזרם' },
      { id: '3.2', title: 'זרם חשמלי' },
      { id: '3.3', title: 'התנגדות וחוק אוהם' },
      { id: '3.4', title: 'הספק ונצילות' },
      { id: '3.5', title: 'חיבור בטור ובמקביל' },
      { id: '3.6', title: 'כא"מ והתנגדות פנימית' },
      { id: '3.7', title: 'מכשירי מדידה' },
      { id: '3.8', title: 'חוקי קירכהוף' },
      { id: '3.9', title: 'מעגל RC' },
      { id: '3.10', title: 'מעבדה: מדידת כא"מ והתנגדות פנימית' },
    ],
  },
  {
    n: 4,
    title: 'השדה המגנטי',
    blurb: 'מגנטים, זרמים, וכוח שמסובב במקום לדחוף.',
    hours: 19,
    lessons: [
      { id: '4.1', title: 'מגנטים וקווי שדה' },
      { id: '4.2', title: 'השדה של תיל ישר' },
      { id: '4.3', title: 'כריכה וסליל' },
      { id: '4.4', title: 'חוק אמפר' },
      { id: '4.5', title: 'כוח לורנץ' },
      { id: '4.6', title: 'תנועה מעגלית וספקטרומטר מסות' },
      { id: '4.7', title: 'שדות מוצלבים' },
      { id: '4.8', title: 'כוח על תיל' },
      { id: '4.9', title: 'תילים מקבילים' },
      { id: '4.10', title: 'מומנט על כריכה ומנוע' },
      { id: '4.11', title: 'מעבדה: השדה המגנטי של כדור הארץ' },
    ],
  },
  {
    n: 5,
    title: 'השראה אלקטרומגנטית',
    blurb: 'שטף שמשתנה, זרם שנולד, והגשר אל משוואות מקסוול.',
    hours: 17,
    lessons: [
      { id: '5.1', title: 'שטף מגנטי' },
      { id: '5.2', title: 'חוק פאראדיי' },
      { id: '5.3', title: 'חוק לנץ' },
      { id: '5.4', title: 'מוט על מסילות' },
      { id: '5.5', title: 'מטען שעובר במעגל' },
      { id: '5.6', title: 'שדה חשמלי מושרה' },
      { id: '5.7', title: 'גנרטור וזרם חילופין' },
      { id: '5.8', title: 'משוואות מקסוול' },
    ],
  },
  {
    n: 6,
    title: 'גשר: מהבגרות לאוניברסיטה',
    blurb: 'הכלים של קורס החשמל והמגנטיות באוניברסיטה: אינטגרלים, שיפוע, דיברגנץ ורוטור, ומשוואות מקסוול בצורה המקומית.',
    beyondBagrut: true,
    lessons: [
      { id: '6.1', title: 'נגזרת: קצב שינוי' },
      { id: '6.2', title: 'אינטגרל: סכום של חתיכות קטנות' },
      { id: '6.3', title: 'השפה של שדות' },
      { id: '6.4', title: 'התפלגויות רציפות: מסכום לאינטגרל' },
      { id: '6.5', title: 'שטף כאינטגרל משטח' },
      { id: '6.6', title: 'אינטגרל קווי, פוטנציאל ושיפוע' },
      { id: '6.7', title: 'דיברגנץ ומשפט הדיברגנץ' },
      { id: '6.8', title: 'רוטור ומשפט סטוקס' },
      { id: '6.9', title: 'משוואות פואסון ולפלס, ומטעני דמות' },
      { id: '6.10', title: 'הדיפול החשמלי' },
      { id: '6.11', title: 'חוק ביו-סבר' },
      { id: '6.12', title: 'זרם ההעתקה' },
      { id: '6.13', title: 'משוואות מקסוול בצורה דיפרנציאלית' },
      { id: '6.14', title: 'גלים אלקטרומגנטיים ואנרגיה בשדה' },
      { id: '6.15', title: 'יחסות ומגנטיות' },
      { id: '6.16', title: 'חזרה: מהבגרות לאוניברסיטה' },
    ],
  },
];

/** "1.5" → "1-5": lesson ids contain a dot, URLs do not. */
export const lessonSlug = (id: string) => id.replace('.', '-');

export function chapterOf(id: string): Chapter | undefined {
  const n = Number(id.split('.')[0]);
  return chapters.find((c) => c.n === n);
}

/** All planned lessons in course order. */
export const lessonOrder: PlannedLesson[] = chapters.flatMap((c) => c.lessons);
