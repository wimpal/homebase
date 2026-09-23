import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSmtpConfigured } from "@/domain/accounts";
import { forgotPasswordAction } from "../actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; message?: string }>;
}) {
  const t = await getTranslations("auth.forgot");
  const tc = await getTranslations("common");
  const smtp = isSmtpConfigured();
  const params = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-emerald-700">{t("title")}</CardTitle>
          <CardDescription>
            {smtp ? t("descriptionSmtp") : t("descriptionNoSmtp")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!smtp && (
            <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              {t("askAdmin")}
            </p>
          )}
          {params.status === "smtp_unset" && (
            <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              {t("askAdmin")}
            </p>
          )}
          {params.status === "sent" && (
            <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              {t("sentGeneric")}
            </p>
          )}
          {params.error && (
            <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
              {params.message || params.error}
            </p>
          )}
          {smtp && params.status !== "sent" && (
            <form action={forgotPasswordAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{tc("email")}</Label>
                <Input id="email" name="email" type="email" required autoComplete="email" />
              </div>
              <Button type="submit" className="w-full">
                {t("submit")}
              </Button>
            </form>
          )}
          <p className="mt-4 text-center text-sm text-zinc-500">
            <Link href="/login" className="text-emerald-600 hover:underline">
              {t("backToSignIn")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
