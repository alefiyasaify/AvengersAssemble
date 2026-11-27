"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { ApiError } from "@/shared/api-client";
import { Button } from "@/shared/ui";

import { exampleFormSchema, type ExampleFormValues } from "../schemas/example-form";

/** Form pattern: zod for UX, backend field errors (error envelope `details`) mapped onto fields. */
export function ExampleForm({
  onSubmit,
}: {
  onSubmit: (values: ExampleFormValues) => Promise<void>;
}) {
  const form = useForm<ExampleFormValues>({
    resolver: zodResolver(exampleFormSchema),
    defaultValues: { name: "" },
  });
  const nameError = form.formState.errors.name?.message;

  async function submit(values: ExampleFormValues) {
    try {
      await onSubmit(values);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fieldErrors())) {
          if (field === "name") form.setError("name", { message });
        }
        form.setError("root", { message: error.message });
        return;
      }
      throw error;
    }
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="example-name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="example-name"
          className="block w-full rounded-md border border-border bg-surface px-3 py-2"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "example-name-error" : undefined}
          {...form.register("name")}
        />
        {nameError ? (
          <p id="example-name-error" className="text-sm text-danger-foreground">
            {nameError}
          </p>
        ) : null}
      </div>
      {form.formState.errors.root ? (
        <p role="alert" className="text-sm text-danger-foreground">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
