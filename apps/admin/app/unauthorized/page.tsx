import { SignOutButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";

import { cardClass, primaryButtonClass } from "@/components/forms";
import { getAdminIdentity } from "@/lib/auth";

export default async function UnauthorizedPage() {
  const identity = await getAdminIdentity();
  if (!identity) {
    redirect("/sign-in");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10 sm:px-10">
      <section className={`${cardClass} flex max-w-md flex-col gap-4`}>
        <h1 className="text-xl font-bold text-white">Not an admin</h1>
        <p className="text-sm leading-6 text-khakis">
          This account ({identity.email ?? "no email"}) isn&apos;t on the Gulch admin list.
        </p>
        <SignOutButton redirectUrl="/sign-in">
          <button className={primaryButtonClass} type="button">
            Sign out
          </button>
        </SignOutButton>
      </section>
    </main>
  );
}
