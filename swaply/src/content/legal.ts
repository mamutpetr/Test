type Doc = { title: string; sections: Array<[string, string[]]> };
type Docs = Record<"terms" | "privacy" | "risk", Doc>;

export const LEGAL_DRAFT_NOTICE = {
  uk: "ЧЕРНЕТКА. Текст не є остаточним і має бути перевірений юристом до запуску сервісу. Регулювання криптоактивів, AML/KYC, санкційні обмеження, захист персональних даних і податковий облік залежать від юрисдикції оператора.",
  en: "DRAFT. This text is not final and must be reviewed by a lawyer before launch. Crypto-asset regulation, AML/KYC, sanctions, data protection and tax treatment depend on the operator's jurisdiction.",
};

export const legal: Record<"uk" | "en", Docs> = {
  uk: {
    terms: {
      title: "Умови використання",
      sections: [
        ["1. Що таке SWAPLY", ["SWAPLY — інформаційно-технологічний сервіс, який порівнює пропозиції обміну криптовалют від сторонніх партнерів. SWAPLY не є обмінником, не зберігає кошти користувачів, не приймає платежів і не створює депозитних адрес."]],
        ["2. Хто надає послугу обміну", ["Обмін виконує партнер, обраний користувачем. Умови обміну, верифікації (KYC/AML), повернення коштів та підтримки визначає партнер. Перед обміном ознайомтеся з умовами партнера."]],
        ["3. Інформація про курси", ["Курси та суми надходять від партнерів і можуть змінитися. Плаваючі курси є оцінкою. Фіксований курс гарантує партнер у межах вказаного ним часу. SWAPLY не гарантує доступність пропозиції."]],
        ["4. Обмеження", ["Заборонено використовувати сервіс для обходу KYC/AML, санкційних чи географічних обмежень, а також для незаконної діяльності. Послуги партнерів можуть бути недоступні у вашій країні."]],
        ["5. Винагорода", ["SWAPLY може отримувати винагороду від партнерів за їхніми партнерськими програмами. Винагорода не впливає на порядок відображення пропозицій."]],
        ["6. Відповідальність", ["Користувач самостійно відповідає за правильність адрес, мереж і memo під час переказу. SWAPLY не контролює виконання обміну партнером."]],
      ],
    },
    privacy: {
      title: "Політика конфіденційності",
      sections: [
        ["Які дані ми обробляємо", ["Параметри пошуку (валюти, мережі, сума) — для показу пропозицій та знеособленої статистики.", "Технічні події: перехід до партнера (без IP-адреси та даних пристрою).", "У вбудованому обміні (якщо увімкнено) — адресу отримання, яку ви вказали, лише для створення операції у партнера."]],
        ["Чого ми не збираємо", ["Seed-фраз, приватних ключів, паролів, номерів карток. Реєстрація для порівняння не потрібна."]],
        ["Обмеження частоти запитів", ["Для захисту від зловживань використовується знеособлений хеш IP-адреси, який не зберігається в базі даних."]],
        ["Передача партнерам", ["Під час переходу партнер отримує дані, які ви вводите на його сайті, згідно з його політикою конфіденційності."]],
        ["Ваші права", ["Права на доступ, виправлення та видалення даних — відповідно до законодавства юрисдикції оператора (наприклад, GDPR)."]],
      ],
    },
    risk: {
      title: "Розкриття ризиків",
      sections: [
        ["Волатильність", ["Ціни криптоактивів можуть різко змінюватися. Плаваюча сума може відрізнятися від показаної."]],
        ["Помилки переказу", ["Переказ у неправильній мережі, на неправильну адресу або без потрібного memo може призвести до безповоротної втрати коштів."]],
        ["Ризики партнерів", ["Партнер може затримати операцію для перевірки, повернути кошти або відмовити в обміні. SWAPLY не може вплинути на ці рішення."]],
        ["Регуляторні ризики", ["Доступність і правовий статус операцій з криптоактивами залежать від країни користувача."]],
      ],
    },
  },
  en: {
    terms: {
      title: "Terms of Service",
      sections: [
        ["1. What SWAPLY is", ["SWAPLY is an information technology service that compares crypto exchange offers from third-party partners. SWAPLY is not an exchange, does not hold user funds, accept payments or create deposit addresses."]],
        ["2. Who provides the exchange", ["The exchange is performed by the partner the user selects. Exchange terms, verification (KYC/AML), refunds and support are defined by the partner. Read the partner's terms before exchanging."]],
        ["3. Rate information", ["Rates and amounts come from partners and may change. Floating rates are estimates. A fixed rate is guaranteed by the partner within the time it states. SWAPLY does not guarantee offer availability."]],
        ["4. Restrictions", ["You may not use the service to circumvent KYC/AML, sanctions or geographic restrictions, or for unlawful activity. Partner services may be unavailable in your country."]],
        ["5. Compensation", ["SWAPLY may receive compensation from partners under their partner programs. It does not affect the order in which offers are displayed."]],
        ["6. Liability", ["You are responsible for correct addresses, networks and memos when transferring. SWAPLY does not control how the partner performs the exchange."]],
      ],
    },
    privacy: {
      title: "Privacy Policy",
      sections: [
        ["Data we process", ["Search parameters (currencies, networks, amount) — to show offers and anonymous statistics.", "Technical events: redirect to a partner (without IP address or device data).", "For embedded exchanges (if enabled) — the payout address you enter, only to create the operation with the partner."]],
        ["What we never collect", ["Seed phrases, private keys, passwords, card numbers. No account is needed to compare."]],
        ["Rate limiting", ["An anonymised hash of the IP address is used to prevent abuse; it is not stored in the database."]],
        ["Sharing with partners", ["When you are redirected, the partner receives the data you enter on its site, under its own privacy policy."]],
        ["Your rights", ["Access, correction and deletion rights apply under the law of the operator's jurisdiction (e.g. GDPR)."]],
      ],
    },
    risk: {
      title: "Risk Disclosure",
      sections: [
        ["Volatility", ["Crypto-asset prices can move sharply. A floating amount may differ from the one shown."]],
        ["Transfer mistakes", ["Sending on the wrong network, to the wrong address or without a required memo can result in irreversible loss."]],
        ["Partner risks", ["A partner may hold a transaction for checks, refund it or refuse it. SWAPLY cannot influence these decisions."]],
        ["Regulatory risks", ["The availability and legal status of crypto-asset operations depend on the user's country."]],
      ],
    },
  },
};
