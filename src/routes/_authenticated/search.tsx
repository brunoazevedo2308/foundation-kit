import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search as SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MIN_QUERY_LENGTH,
  globalSearch,
  isQueryTooShort,
  normalizeTerm,
  type GlobalSearchResult,
  type SearchResultItem,
} from "@/lib/global-search";

/**
 * US-007 (1º ciclo) — Busca global.
 *
 * Consulta lexical (`ilike`) sobre clientes, embarcações, ações,
 * entregáveis e evidências, sempre dentro do escopo garantido pela RLS.
 */
export const Route = createFileRoute("/_authenticated/search")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  head: () => ({
    meta: [
      { title: "Busca global · DP Suite" },
      {
        name: "description",
        content: "Busque ações, entregáveis, evidências, clientes e embarcações do DP Suite.",
      },
      { property: "og:title", content: "Busca global · DP Suite" },
      {
        property: "og:description",
        content: "Busque ações, entregáveis, evidências, clientes e embarcações do DP Suite.",
      },
    ],
  }),
  component: SearchPage,
});

function ResultLink({ item }: { item: SearchResultItem }) {
  const content = (
    <>
      <span className="block truncate text-sm font-medium">{item.title}</span>
      {item.subtitle ? (
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.subtitle}</span>
      ) : null}
    </>
  );

  const className =
    "block rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted/60";

  if (!item.target) {
    return (
      <li>
        <div className={className}>{content}</div>
      </li>
    );
  }

  if (item.target.route === "/actions/$actionId") {
    return (
      <li>
        <Link
          to="/actions/$actionId"
          params={{ actionId: item.target.actionId }}
          className={className}
        >
          {content}
        </Link>
      </li>
    );
  }

  if (item.target.route === "/clients/$clientId/edit") {
    return (
      <li>
        <Link
          to="/clients/$clientId/edit"
          params={{ clientId: item.target.clientId }}
          className={className}
        >
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <Link
        to="/vessels/$vesselId/edit"
        params={{ vesselId: item.target.vesselId }}
        className={className}
      >
        {content}
      </Link>
    </li>
  );
}

function SearchPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const [term, setTerm] = useState(q);
  const [result, setResult] = useState<GlobalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTerm(q);
  }, [q]);

  useEffect(() => {
    if (isQueryTooShort(q)) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    globalSearch(q)
      .then((res) => {
        if (active) setResult(res);
      })
      .catch((err) => {
        if (active)
          setError(err instanceof Error ? err.message : "Não foi possível realizar a busca.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [q]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void navigate({ to: "/search", search: { q: normalizeTerm(term) } });
  }

  const tooShort = isQueryTooShort(q);
  const failedGroups = result?.groups.filter((g) => g.failed) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="Busca global"
        description="Ações, entregáveis, evidências, clientes e embarcações da sua organização."
      />

      <form onSubmit={handleSubmit} className="flex gap-2" role="search">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar no DP Suite..."
          aria-label="Termo de busca"
          autoFocus
        />
        <Button type="submit">
          <SearchIcon className="mr-2 h-4 w-4" />
          Buscar
        </Button>
      </form>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {tooShort ? (
        <p className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Digite ao menos {MIN_QUERY_LENGTH} caracteres para buscar.
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Buscando...</p>
      ) : result ? (
        <div className="flex flex-col gap-6">
          <p className="text-sm text-muted-foreground">
            {result.total === 0
              ? `Nenhum resultado para “${result.term}”.`
              : `${result.total} resultado(s) para “${result.term}”.`}
          </p>

          {failedGroups.length > 0 ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              Alguns grupos falharam: {failedGroups.map((g) => g.label).join(", ")}.
            </p>
          ) : null}

          {result.groups
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <section key={group.key} className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold tracking-tight">
                  {group.label}{" "}
                  <span className="text-muted-foreground">({group.items.length})</span>
                </h2>
                <ul className="flex flex-col gap-2">
                  {group.items.map((item) => (
                    <ResultLink key={`${item.group}:${item.id}`} item={item} />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      ) : null}
    </div>
  );
}
