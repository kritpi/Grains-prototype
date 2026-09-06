import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { ClaimUsernameForm } from "./claim-username-form";

export const metadata = { title: "Choose a username · Grains" };

export default async function WelcomePage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (user.username) redirect(`/u/${user.username}`);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-4xl">Choose a username</h1>
      <p className="mt-3 mb-8 text-sm text-muted-foreground">
        It becomes your page at <span className="text-foreground">/u/@you</span>{" "}
        and signs every contribution you make. It cannot be changed later.
      </p>
      <ClaimUsernameForm />
    </main>
  );
}
