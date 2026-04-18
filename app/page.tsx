"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { Form, Question, QuestionType, StudentAnswers } from "@/lib/forms";

type ApiError = {
  error?: string;
};

type SessionUser = {
  id: string;
  email?: string | null;
};

type SessionProfile = {
  id: string;
  role: "teacher" | "student";
  display_name: string | null;
};

type SessionData = {
  user: SessionUser;
  profile: SessionProfile | null;
};

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const data = (await response.json()) as T & ApiError;

  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }

  return data;
}

export default function Home() {
  const [session, setSession] = useState<SessionData | null | undefined>(undefined);
  const [mode, setMode] = useState<"teacher" | "student">("teacher");
  const [forms, setForms] = useState<Form[]>([]);
  const [activeFormId, setActiveFormId] = useState("");
  const [studentAnswers, setStudentAnswers] = useState<StudentAnswers>({});
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isTeacher = session?.profile?.role === "teacher";

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (session && !isTeacher && mode === "teacher") {
        setMode("student");
      }
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [session, isTeacher, mode]);

  const tabForms = useMemo(() => {
    if (!session) {
      return [];
    }
    if (mode === "teacher" && isTeacher) {
      return forms.filter((form) => form.createdBy === session.user.id);
    }
    return forms;
  }, [mode, isTeacher, forms, session]);

  const activeForm = useMemo(
    () => tabForms.find((form) => form.id === activeFormId),
    [tabForms, activeFormId],
  );

  const canLoadStudentAnswers =
    Boolean(session) && mode === "student" && Boolean(activeFormId);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/auth/session");
          const data = (await response.json()) as {
            user: SessionUser | null;
            profile: SessionProfile | null;
          };
          if (!data.user) {
            setSession(null);
            return;
          }
          setSession({ user: data.user, profile: data.profile });
        } catch {
          setSession(null);
        }
      })();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, []);

  const fetchForms = async () => {
    setIsLoadingForms(true);
    setErrorMessage("");
    try {
      const data = await requestJson<{ forms: Form[] }>("/api/forms");
      setForms(data.forms);
      setActiveFormId((currentActiveId) => {
        const pool = data.forms;
        if (currentActiveId && pool.some((form) => form.id === currentActiveId)) {
          return currentActiveId;
        }
        return pool[0]?.id ?? "";
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load forms.");
    } finally {
      setIsLoadingForms(false);
    }
  };

  useEffect(() => {
    if (session === undefined || session === null) {
      return;
    }
    const timeoutId = setTimeout(() => {
      void fetchForms();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }
    const timeoutId = setTimeout(() => {
      const pool =
        mode === "teacher" && session.profile?.role === "teacher"
          ? forms.filter((form) => form.createdBy === session.user.id)
          : forms;
      if (pool.length === 0) {
        setActiveFormId("");
        return;
      }
      if (!activeFormId || !pool.some((form) => form.id === activeFormId)) {
        setActiveFormId(pool[0].id);
      }
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [mode, forms, session, activeFormId]);

  useEffect(() => {
    if (!canLoadStudentAnswers || !activeFormId) {
      return;
    }

    const loadStudentResponse = async () => {
      try {
        const data = await requestJson<{ answers: StudentAnswers }>(
          `/api/forms/${activeFormId}/responses`,
        );
        setStudentAnswers(data.answers);
        setStatusMessage("Loaded saved answers.");
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Failed to load student answers.");
      }
    };

    const timeoutId = setTimeout(() => {
      void loadStudentResponse();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [canLoadStudentAnswers, activeFormId]);

  const logout = async () => {
    setIsMutating(true);
    setStatusMessage("");
    try {
      await requestJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
      setSession(null);
      setForms([]);
      setActiveFormId("");
      setStudentAnswers({});
      setStatusMessage("Signed out.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Sign out failed.");
    } finally {
      setIsMutating(false);
    }
  };

  const updateActiveForm = (updater: (form: Form) => Form) => {
    setForms((currentForms) =>
      currentForms.map((form) => (form.id === activeFormId ? updater(form) : form)),
    );
  };

  const addForm = async () => {
    setIsMutating(true);
    setStatusMessage("");
    try {
      const data = await requestJson<{ form: Form }>("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setForms((currentForms) => [...currentForms, data.form]);
      setActiveFormId(data.form.id);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to create form.");
    } finally {
      setIsMutating(false);
    }
  };

  const saveActiveFormDetails = async () => {
    if (!activeForm) {
      return;
    }

    setIsMutating(true);
    setStatusMessage("");
    try {
      await requestJson<{ ok: true }>(`/api/forms/${activeForm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: activeForm.title,
          description: activeForm.description,
        }),
      });
      setStatusMessage("Form saved.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save form.");
    } finally {
      setIsMutating(false);
    }
  };

  const addQuestion = async (type: QuestionType) => {
    if (!activeForm) {
      return;
    }

    setIsMutating(true);
    setStatusMessage("");
    try {
      const data = await requestJson<{ question: Question }>(
        `/api/forms/${activeForm.id}/questions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        },
      );
      updateActiveForm((form) => ({
        ...form,
        questions: [...form.questions, data.question],
      }));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to add question.");
    } finally {
      setIsMutating(false);
    }
  };

  const saveQuestion = async (question: Question) => {
    setIsMutating(true);
    setStatusMessage("");
    try {
      await requestJson<{ ok: true }>(`/api/questions/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: question.prompt,
          type: question.type,
          options: question.options,
        }),
      });
      setStatusMessage("Question saved.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save question.");
    } finally {
      setIsMutating(false);
    }
  };

  const removeQuestion = async (questionId: string) => {
    setIsMutating(true);
    setStatusMessage("");
    try {
      await requestJson<{ ok: true }>(`/api/questions/${questionId}`, {
        method: "DELETE",
      });
      updateActiveForm((form) => ({
        ...form,
        questions: form.questions.filter((question) => question.id !== questionId),
      }));
      setStudentAnswers((currentAnswers) => {
        const nextAnswers = { ...currentAnswers };
        delete nextAnswers[questionId];
        return nextAnswers;
      });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to remove question.");
    } finally {
      setIsMutating(false);
    }
  };

  const saveStudentAnswers = async () => {
    if (!activeForm) {
      return;
    }

    setIsMutating(true);
    setStatusMessage("");
    try {
      await requestJson<{ ok: true }>(`/api/forms/${activeForm.id}/responses`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: studentAnswers,
        }),
      });
      setStatusMessage("Answers saved.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to save answers.");
    } finally {
      setIsMutating(false);
    }
  };

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-600">
        Checking session…
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="min-h-screen bg-zinc-100 py-16 text-zinc-900">
        <main className="mx-auto max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold">Classroom Form Builder</h1>
          <p className="mt-2 text-zinc-600">Sign in to create forms or submit responses.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="rounded-md border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900"
            >
              Register
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 py-10 text-zinc-900">
      <main className="mx-auto w-full max-w-5xl rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Classroom Form Builder</h1>
            <p className="text-zinc-600">
              Teachers create forms, students complete and edit responses.
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Signed in as {session.user.email ?? session.user.id}
              {session.profile ? ` · ${session.profile.role}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-lg border border-zinc-300 p-1">
              <button
                type="button"
                onClick={() => setMode("teacher")}
                disabled={!isTeacher}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  mode === "teacher" ? "bg-zinc-900 text-white" : "text-zinc-600"
                } ${!isTeacher ? "cursor-not-allowed opacity-50" : ""}`}
                title={!isTeacher ? "Only teacher accounts can use teacher view." : undefined}
              >
                Teacher view
              </button>
              <button
                type="button"
                onClick={() => setMode("student")}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  mode === "student" ? "bg-zinc-900 text-white" : "text-zinc-600"
                }`}
              >
                Student view
              </button>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              disabled={isMutating}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700"
            >
              Log out
            </button>
          </div>
        </div>

        <section className="mb-8 rounded-xl border border-zinc-200 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {mode === "teacher" && isTeacher ? "My forms" : "Forms"}
            </h2>
            {mode === "teacher" && isTeacher ? (
              <button
                type="button"
                onClick={addForm}
                disabled={isMutating}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
              >
                New form
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {tabForms.map((form) => (
              <button
                key={form.id}
                type="button"
                onClick={() => setActiveFormId(form.id)}
                className={`rounded-md border px-3 py-2 text-sm ${
                  form.id === activeFormId
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 bg-white text-zinc-700"
                }`}
              >
                {form.title || "Untitled Form"}
              </button>
            ))}
          </div>
        </section>

        {isLoadingForms ? (
          <p className="text-zinc-600">Loading forms...</p>
        ) : errorMessage ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
            {errorMessage}
          </p>
        ) : !activeForm ? (
          <p className="text-zinc-600">
            {mode === "teacher" && isTeacher
              ? "Create a form to get started."
              : "No forms are available yet."}
          </p>
        ) : mode === "teacher" ? (
          <section className="space-y-6">
            <div className="space-y-3 rounded-xl border border-zinc-200 p-4">
              <label className="block text-sm font-medium">
                Form title
                <input
                  type="text"
                  value={activeForm.title}
                  onChange={(event) =>
                    updateActiveForm((form) => ({ ...form, title: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                />
              </label>

              <label className="block text-sm font-medium">
                Form description
                <textarea
                  value={activeForm.description}
                  onChange={(event) =>
                    updateActiveForm((form) => ({ ...form, description: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                  rows={3}
                />
              </label>

              <button
                type="button"
                onClick={saveActiveFormDetails}
                disabled={isMutating}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
              >
                Save form details
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void addQuestion("multipleChoice")}
                disabled={isMutating}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
              >
                Add multiple choice
              </button>
              <button
                type="button"
                onClick={() => void addQuestion("text")}
                disabled={isMutating}
                className="rounded-md bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-900"
              >
                Add text area
              </button>
            </div>

            <div className="space-y-4">
              {activeForm.questions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-zinc-600">
                  Add questions to this form.
                </p>
              ) : (
                activeForm.questions.map((question, index) => (
                  <article key={question.id} className="rounded-xl border border-zinc-200 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-zinc-500">
                        Question {index + 1}
                      </h3>
                      <button
                        type="button"
                        onClick={() => void removeQuestion(question.id)}
                        disabled={isMutating}
                        className="text-sm font-medium text-red-600"
                      >
                        Remove
                      </button>
                    </div>

                    <label className="block text-sm font-medium">
                      Prompt
                      <input
                        type="text"
                        value={question.prompt}
                        onChange={(event) =>
                          updateActiveForm((form) => ({
                            ...form,
                            questions: form.questions.map((formQuestion) =>
                              formQuestion.id === question.id
                                ? { ...formQuestion, prompt: event.target.value }
                                : formQuestion,
                            ),
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                      />
                    </label>

                    {question.type === "multipleChoice" ? (
                      <div className="mt-4 space-y-2">
                        {question.options.map((option, optionIndex) => (
                          <label
                            key={`${question.id}-option-${optionIndex}`}
                            className="block text-sm"
                          >
                            Option {optionIndex + 1}
                            <input
                              type="text"
                              value={option}
                              onChange={(event) =>
                                updateActiveForm((form) => ({
                                  ...form,
                                  questions: form.questions.map((formQuestion) => {
                                    if (formQuestion.id !== question.id) {
                                      return formQuestion;
                                    }

                                    return {
                                      ...formQuestion,
                                      options: formQuestion.options.map((currentOption, i) =>
                                        i === optionIndex ? event.target.value : currentOption,
                                      ),
                                    };
                                  }),
                                }))
                              }
                              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                            />
                          </label>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveForm((form) => ({
                              ...form,
                              questions: form.questions.map((formQuestion) => {
                                if (formQuestion.id !== question.id) {
                                  return formQuestion;
                                }

                                return {
                                  ...formQuestion,
                                  options: [
                                    ...formQuestion.options,
                                    `Option ${formQuestion.options.length + 1}`,
                                  ],
                                };
                              }),
                            }))
                          }
                          className="rounded-md bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-900"
                        >
                          Add option
                        </button>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => void saveQuestion(question)}
                      disabled={isMutating}
                      className="mt-4 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
                    >
                      Save question
                    </button>
                  </article>
                ))
              )}
            </div>
          </section>
        ) : (
          <section className="space-y-5">
            <header>
              <h2 className="text-2xl font-bold">{activeForm.title || "Untitled Form"}</h2>
              {activeForm.description ? (
                <p className="mt-1 text-zinc-600">{activeForm.description}</p>
              ) : null}
            </header>

            {activeForm.questions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-zinc-600">
                This form has no questions yet.
              </p>
            ) : (
              <form className="space-y-4">
                {activeForm.questions.map((question, index) => (
                  <article key={question.id} className="rounded-xl border border-zinc-200 p-4">
                    <h3 className="mb-2 font-semibold">
                      {index + 1}. {question.prompt || "Untitled question"}
                    </h3>

                    {question.type === "multipleChoice" ? (
                      <div className="space-y-2">
                        {question.options.map((option, optionIndex) => (
                          <label
                            key={`${question.id}-${optionIndex}`}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="radio"
                              name={question.id}
                              value={option}
                              checked={studentAnswers[question.id] === option}
                              onChange={(event) =>
                                setStudentAnswers((currentAnswers) => ({
                                  ...currentAnswers,
                                  [question.id]: event.target.value,
                                }))
                              }
                            />
                            <span>{option || `Option ${optionIndex + 1}`}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        rows={4}
                        value={studentAnswers[question.id] ?? ""}
                        onChange={(event) =>
                          setStudentAnswers((currentAnswers) => ({
                            ...currentAnswers,
                            [question.id]: event.target.value,
                          }))
                        }
                        placeholder="Type your response..."
                        className="w-full rounded-md border border-zinc-300 px-3 py-2"
                      />
                    )}
                  </article>
                ))}
              </form>
            )}

            <button
              type="button"
              onClick={() => void saveStudentAnswers()}
              disabled={isMutating}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
            >
              Save answers
            </button>
          </section>
        )}

        {statusMessage ? (
          <p className="mt-6 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            {statusMessage}
          </p>
        ) : null}
      </main>
    </div>
  );
}
