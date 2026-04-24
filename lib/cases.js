/**
 * lib/cases.js
 * Таблица кейсов для автоматической рекомендации в директ-помощнике.
 * Только реальные ученики из BRIEF_core_offer.md.
 */

export const CASES = [
  {
    id: 'fedor',
    name: 'Фёдор',
    role: 'Веб-разработчик, Новосибирск',
    result: '300 000+ ₽, пробил потолок который стоял месяцами',
    before: '150–180к/мес, одна и та же цифра месяц за месяцем',
    pain: 'страх цены, психологический потолок, региональный рынок',
    quote: 'Пробуешь — и снова та же цифра. Что ни делай.',
  },
  {
    id: 'samat',
    name: 'Самат',
    role: 'Таргетолог',
    result: '460 000 ₽ в марте, окупил обучение в первый месяц',
    before: 'нестабильный доход, системы не было',
    pain: 'нет системы, непредсказуемый доход',
    quote: 'В этом месяце деньги есть — а в следующем? Непонятно.',
  },
  {
    id: 'marat',
    name: 'Марат',
    role: 'Дизайнер, основатель студии',
    result: '600 000 ₽, запустил своё обучение по дизайну, нанял людей',
    before: '280к/мес, не верил в свой ценник, тянул всё сам',
    pain: 'не верит в свою цену, не может делегировать',
    quote: 'Называл цену — и что-то внутри говорило: нет, это слишком много.',
  },
  {
    id: 'oleg',
    name: 'Олег',
    role: 'Digital-агентство / B2B',
    result: '420 000 ₽ за 11 дней после начала работы',
    before: '80к/мес, полгода прокрастинации, избегал звонков',
    pain: 'прокрастинация, страх звонков, разовые сделки без системы',
    quote: 'Думал что просто не умею продавать.',
  },
  {
    id: 'egor',
    name: 'Егор',
    role: 'Продажи маркетинговых услуг',
    result: '100 000 ₽ за первый месяц, с абсолютного нуля',
    before: '0 ₽, несколько лет без результата',
    pain: 'нет опыта продаж, начинающий',
    quote: 'Несколько лет пытался — ничего. Чувствовал себя полным нулём.',
  },
];

/**
 * recommendCase(quizAnswers)
 * На основе ответов диагностики возвращает наиболее подходящий кейс.
 * Логика из TZ_drip_bot.md секция 13.
 */
export function recommendCase(quizAnswers = {}) {
  const q1 = (quizAnswers.q1 || '').toLowerCase();
  const q2 = (quizAnswers.q2 || '').toLowerCase();
  const q5 = (quizAnswers.q5 || '').toLowerCase();
  const q6 = (quizAnswers.q6 || '').toLowerCase();
  const q7 = (quizAnswers.q7 || '').toLowerCase();

  // Определяем доход из q1
  const incomeMatch = q1.match(/\d+/);
  const income = incomeMatch ? parseInt(incomeMatch[0], 10) : 0;

  // Начинающий / нет опыта
  const isBeginnerKeywords = ['0', 'ноль', 'нет клиентов', 'нет опыта', 'только начинаю'];
  if (isBeginnerKeywords.some(w => q1.includes(w) || q5.includes(w))) {
    return CASES.find(c => c.id === 'egor');
  }

  // Веб / IT / технические
  const isWebKeywords = ['веб', 'разработ', 'web', 'сайт', 'программ', 'frontend', 'backend', 'fullstack'];
  if (isWebKeywords.some(w => q2.includes(w))) {
    return CASES.find(c => c.id === 'fedor');
  }

  // SMM / таргет / контекст / реклама
  const isSmmKeywords = ['smm', 'таргет', 'контекст', 'реклам', 'маркетинг', 'соцсет'];
  if (isSmmKeywords.some(w => q2.includes(w))) {
    return CASES.find(c => c.id === 'samat');
  }

  // Дизайн / креатив
  const isDesignKeywords = ['дизайн', 'design', 'иллюстра', 'график', 'ux', 'ui', 'бренд'];
  if (isDesignKeywords.some(w => q2.includes(w))) {
    return CASES.find(c => c.id === 'marat');
  }

  // B2B / агентство / продажи
  const isB2bKeywords = ['b2b', 'агентств', 'продаж', 'корпора', 'бизнес'];
  if (isB2bKeywords.some(w => q2.includes(w))) {
    return CASES.find(c => c.id === 'oleg');
  }

  // Психологический блок по цене (любая ниша)
  const isPriceBlockKeywords = ['страх', 'боюсь', 'неловко', 'неудобно', 'стесняюсь', 'сжимается', 'тревог'];
  if (isPriceBlockKeywords.some(w => q7.includes(w) || q5.includes(w))) {
    return CASES.find(c => c.id === 'fedor'); // психологический блок — Фёдор или Марат
  }

  // Нет системы / нестабильно
  const isNoSystemKeywords = ['нестабильно', 'нет системы', 'непредсказуем', 'сарафан', 'биржа', 'лотерея'];
  if (isNoSystemKeywords.some(w => q6.includes(w) || q5.includes(w))) {
    return CASES.find(c => c.id === 'samat');
  }

  // По уровню дохода (fallback)
  if (income > 0 && income <= 50) return CASES.find(c => c.id === 'egor');
  if (income > 50 && income <= 120) return CASES.find(c => c.id === 'fedor');
  if (income > 120 && income <= 250) return CASES.find(c => c.id === 'marat');
  if (income > 250) return CASES.find(c => c.id === 'oleg');

  // Default
  return CASES.find(c => c.id === 'fedor');
}
