"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { claimUsernameAction, type ClaimState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Claiming…" : "Claim it"}
    </Button>
  );
}

export function ClaimUsernameForm() {
  const [state, action] = useActionState<ClaimState, FormData>(
    claimUsernameAction,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="flex items-center border border-input">
        <span className="pl-3 text-sm text-muted-foreground select-none">
          /u/@
        </span>
        <input
          name="username"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={30}
          required
          aria-invalid={state ? true : undefined}
          aria-describedby={state ? "username-error" : undefined}
          className="flex-1 bg-transparent px-1 py-2.5 text-sm outline-none"
        />
      </div>

      {state ? (
        <p
          id="username-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          3–30 characters. Lowercase letters, numbers, underscore and dot.
        </p>
      )}

      <Submit />
    </form>
  );
}
