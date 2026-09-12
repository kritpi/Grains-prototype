import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { currentUser, signIn } from "@/lib/auth";

export const metadata = { title: "Sign in · Grains" };

/**
 * One action, by design. Google is the only provider (a resolved product
 * decision), so there is no account creation flow, no password field, and
 * nothing to choose between.
 */
export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const { next } = await searchParams;
  const destination = typeof next === "string" ? next : "/";

  const user = await currentUser();
  if (user) redirect(user.username ? destination : "/welcome");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-4xl">Grains</h1>
      <p className="mt-3 mb-10 text-sm text-muted-foreground">
        Sign in to add a lab, correct one, or keep a photobook. Browsing needs
        no account.
      </p>

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: destination });
        }}
      >
        {/* Outlined, not filled. The prototype draws this as a 1.5px ink
            border on paper, and --primary is now the signal colour: a filled
            red "Continue with Google" would both contradict the design and
            fight Google's own button guidance. The sign-in screen has one
            action, so nothing here competes with it for emphasis. */}
        <Button type="submit" variant="outline" size="lg" className="w-full">
          Continue with Google
        </Button>
      </form>
    </main>
  );
}
