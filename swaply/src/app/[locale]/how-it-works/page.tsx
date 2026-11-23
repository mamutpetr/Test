import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { PageShell } from "@/components/layout/PageShell";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "uk" ? "Як це працює" : "How it works", alternates: { canonical: `/${locale}/how-it-works` } };
}

export default async function How({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (locale === "en")
    return (
      <PageShell title="How SWAPLY works" lead="An aggregator that compares partner offers. We never touch your money.">
        <h2>1. You describe the exchange</h2>
        <p>Choose what you send (currency + network), what you want to receive and the amount. No account needed.</p>
        <h2>2. We ask connected partners in parallel</h2>
        <p>Only partners that actually support your route are asked, through their official APIs, on our server. Each answer is normalised to the same format. Values the partner did not return are shown as unknown — never guessed.</p>
        <h2>3. Offers are ranked by what you receive</h2>
        <ul>
          <li>The best offer is the largest final amount in the same currency and network.</li>
          <li>Known fees are listed; where a partner does not say whether a fee is included, we tell you.</li>
          <li>Our partner reward never changes the order.</li>
        </ul>
        <h2>4. We re-check before you leave</h2>
        <p>When you press “Exchange”, we ask the partner again. If the amount dropped, you see the new value and confirm it. Expired offers are never shown as current.</p>
        <h2>5. You exchange with the partner</h2>
        <p>You continue on the partner&apos;s website via our official partner link. The partner provides the deposit address, verification and support. SWAPLY earns a share from the partner under its affiliate program.</p>
      </PageShell>
    );
  return (
    <PageShell title="Як працює SWAPLY" lead="Агрегатор, що порівнює пропозиції партнерів. Ми ніколи не торкаємося ваших коштів.">
      <h2>1. Ви описуєте обмін</h2>
      <p>Оберіть, що віддаєте (валюта + мережа), що хочете отримати і суму. Акаунт не потрібен.</p>
      <h2>2. Паралельно запитуємо підключених партнерів</h2>
      <p>Запит отримують лише партнери, які реально підтримують ваш напрямок, — через їхні офіційні API, на нашому сервері. Кожна відповідь приводиться до єдиного формату. Значення, яких партнер не повернув, позначаються як невідомі — ми їх не вигадуємо.</p>
      <h2>3. Ранжуємо за сумою, яку ви отримаєте</h2>
      <ul>
        <li>Найкраща пропозиція — найбільша кінцева сума в тій самій валюті й мережі.</li>
        <li>Відомі комісії показані; якщо партнер не вказує, чи враховано комісію, ми про це кажемо.</li>
        <li>Наша партнерська винагорода не змінює порядок.</li>
      </ul>
      <h2>4. Перевіряємо ще раз перед переходом</h2>
      <p>Коли ви натискаєте «Обміняти», ми знову запитуємо партнера. Якщо сума зменшилась — показуємо нову і просимо підтвердити. Прострочені пропозиції ніколи не показуються як актуальні.</p>
      <h2>5. Ви обмінюєте у партнера</h2>
      <p>Ви продовжуєте на сайті партнера за нашим офіційним партнерським посиланням. Адресу депозиту, верифікацію та підтримку надає партнер. SWAPLY отримує частку від партнера за його партнерською програмою.</p>
    </PageShell>
  );
}
