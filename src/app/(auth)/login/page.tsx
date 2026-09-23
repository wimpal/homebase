import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getHouseholdCountMode } from "@/domain/accounts";
import { loginAction } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const t = await getTranslations("auth.login");
  const tc = await getTranslations("common");
  const { mode } = await getHouseholdCountMode();
  const params = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-emerald-700">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {params.status === "password_reset" && (
            <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              {t("passwordResetDone")}
            </p>
          )}
          {params.error === "invalid_credentials" && (
            <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
              {t("invalidCredentials")}
            </p>
          )}
          <form action={loginAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{tc("email")}</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{tc("password")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full">
              {t("submit")}
            </Button>
          </form>
          <p className="mt-3 text-center text-sm">
            <Link href="/forgot-password" className="text-emerald-600 hover:underline">
              {t("forgotPassword")}
            </Link>
          </p>
          <p className="mt-4 text-center text-sm text-zinc-500">
            {mode === "zero" && (
              <>
                {t("noAccount")}{" "}
                <Link href="/register" className="text-emerald-600 hover:underline">
                  {t("createHousehold")}
                </Link>
              </>
            )}
            {mode === "one" && (
              <>
                {t("needAccount")}{" "}
                <Link href="/join" className="text-emerald-600 hover:underline">
                  {t("joinAccount")}
                </Link>
              </>
            )}
            {mode === "many" && <span>{t("installMisconfigured")}</span>}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
