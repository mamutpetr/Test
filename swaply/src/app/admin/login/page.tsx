import { redirect } from "next/navigation";
import { getAdmin } from "@/server/admin/auth";
import { Logo } from "@/components/layout/Logo";
import { LoginForm } from "./LoginForm";

export default async function AdminLogin() {
  if (await getAdmin()) redirect("/admin");
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 shadow-card">
        <Logo className="mb-6" />
        <h1 className="mb-4 text-xl font-semibold">Вхід для адміністраторів</h1>
        <LoginForm />
      </div>
    </div>
  );
}
