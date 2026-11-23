export const faqItems: Record<"uk" | "en", Array<{ q: string; a: string }>> = {
  uk: [
    { q: "SWAPLY зберігає мої кошти?", a: "Ні. SWAPLY не має гаманців, не приймає платежів і не створює депозитних адрес. Обмін виконує партнерський сервіс, якому ви надсилаєте кошти напряму." },
    { q: "Як ви визначаєте найвигідніший обмін?", a: "За кінцевою сумою, яку ви отримаєте в тій самій валюті й мережі, з урахуванням комісій, про які повідомив партнер. Винагорода SWAPLY не впливає на порядок пропозицій." },
    { q: "Чому сума може змінитися?", a: "Плаваючий курс — це оцінка партнера, вона змінюється з ринком. Фіксований курс партнер гарантує до закінчення таймера. Перед переходом ми повторно перевіряємо пропозицію і, якщо сума зменшилась, просимо підтвердження." },
    { q: "Що означає «без верифікації»?", a: "Це заява партнера про звичайні операції. Вона не гарантує, що партнер не запросить перевірку (AML/KYC) для конкретної транзакції." },
    { q: "Чим відрізняються мережі TRC20 і ERC20?", a: "Це різні блокчейни для одного токена (наприклад, USDT). Надсилати потрібно в тій мережі, яку обрано в обміні. Помилка з мережею може призвести до втрати коштів." },
    { q: "Як SWAPLY заробляє?", a: "Партнери виплачують нам частку свого доходу або реферальну винагороду за офіційними партнерськими програмами. Це вже враховано в сумі, яку показує партнер." },
    { q: "Чи можна отримати гривні на картку?", a: "Лише через партнерів, які офіційно підтримують таку виплату для вашої країни. Якщо такого партнера немає, ми чесно показуємо, що напрямок недоступний." },
    { q: "Що робити, якщо з обміном проблема?", a: "Звертайтеся до служби підтримки партнера, який виконував обмін — лише він бачить вашу транзакцію. Ми допоможемо знайти контакт: див. сторінку «Підтримка»." },
  ],
  en: [
    { q: "Does SWAPLY hold my funds?", a: "No. SWAPLY has no wallets, accepts no payments and creates no deposit addresses. The exchange is performed by the partner service you send funds to directly." },
    { q: "How do you find the best deal?", a: "By the final amount you receive in the same currency and network, after the fees the partner reports. SWAPLY's reward never affects the order." },
    { q: "Why can the amount change?", a: "A floating rate is the partner's estimate and moves with the market. A fixed rate is guaranteed by the partner until the timer ends. Before you leave we re-check the offer and ask you to confirm if the amount dropped." },
    { q: "What does “no verification” mean?", a: "It is the partner's statement for regular operations. It does not guarantee the partner will not request AML/KYC checks for a specific transaction." },
    { q: "What is the difference between TRC20 and ERC20?", a: "They are different blockchains for the same token (e.g. USDT). You must send on the network chosen in the exchange. Using the wrong network can lose your funds." },
    { q: "How does SWAPLY make money?", a: "Partners pay us a revenue share or referral reward under their official partner programs. This is already reflected in the amount the partner quotes." },
    { q: "Can I receive hryvnia on a card?", a: "Only via partners that officially support that payout for your country. If there is none, we clearly show the route is unavailable." },
    { q: "What if something goes wrong?", a: "Contact the support of the partner that performed the exchange — only they can see your transaction. See the Support page for help finding the contact." },
  ],
};
