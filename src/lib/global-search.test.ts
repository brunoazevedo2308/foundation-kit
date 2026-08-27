import { describe, expect, it } from "vitest";

import {
  GROUP_LIMIT,
  MIN_QUERY_LENGTH,
  SEARCH_GROUP_ORDER,
  buildOrFilter,
  escapeLikeTerm,
  groupLabel,
  isQueryTooShort,
  isSearchable,
  mapActionResult,
  mapClientResult,
  mapDeliverableResult,
  mapEvidenceResult,
  mapVesselResult,
  normalizeTerm,
  sortGroups,
  totalResults,
  type SearchGroupResult,
} from "./global-search";

describe("normalizeTerm / isQueryTooShort", () => {
  it("remove espaços redundantes", () => {
    expect(normalizeTerm("  dp   2 ")).toBe("dp 2");
  });

  it("exige o termo mínimo", () => {
    expect(MIN_QUERY_LENGTH).toBe(2);
    expect(isQueryTooShort("a")).toBe(true);
    expect(isQueryTooShort("  a  ")).toBe(true);
    expect(isQueryTooShort("dp")).toBe(false);
  });
});

describe("escapeLikeTerm / buildOrFilter", () => {
  it("escapa curingas do LIKE", () => {
    expect(escapeLikeTerm("100%_x")).toBe("100\\%\\_x");
  });

  it("neutraliza vírgulas e parênteses do filtro or", () => {
    expect(escapeLikeTerm("a,b(c)")).toBe("a b c");
  });

  it("monta o filtro or com todas as colunas", () => {
    expect(buildOrFilter(["name", "code"], "dp")).toBe("name.ilike.%dp%,code.ilike.%dp%");
  });
});

describe("mapping por grupo", () => {
  it("cliente aponta para a edição do cliente", () => {
    expect(
      mapClientResult({
        id: "c1",
        name: "Petro",
        code: "PT",
        contact_name: "Ana",
        contact_email: "ana@x.com",
      }),
    ).toEqual({
      id: "c1",
      group: "clients",
      title: "Petro",
      subtitle: "PT · Ana · ana@x.com",
      target: { route: "/clients/$clientId/edit", clientId: "c1" },
    });
  });

  it("embarcação exibe IMO e aponta para a edição", () => {
    const item = mapVesselResult({
      id: "v1",
      name: "Skandi",
      imo_number: "12345",
      vessel_type: null,
      dp_class: "DP2",
    });
    expect(item.subtitle).toBe("IMO 12345 · DP2");
    expect(item.target).toEqual({ route: "/vessels/$vesselId/edit", vesselId: "v1" });
  });

  it("ação aponta para o próprio detalhe", () => {
    const item = mapActionResult({
      id: "a1",
      title: "Inspeção",
      description: null,
      origin: null,
      action_type: "auditoria",
      status: "open",
    });
    expect(item.target).toEqual({ route: "/actions/$actionId", actionId: "a1" });
    expect(item.subtitle).toBe("open · auditoria");
  });

  it("entregável resolve a ação pai", () => {
    expect(
      mapDeliverableResult({
        id: "d1",
        action_id: "a9",
        title: "Relatório",
        description: null,
        status: null,
      }).target,
    ).toEqual({ route: "/actions/$actionId", actionId: "a9" });
  });

  it("entregável sem action_id fica sem link", () => {
    expect(
      mapDeliverableResult({
        id: "d1",
        action_id: null,
        title: "Relatório",
        description: null,
        status: null,
      }).target,
    ).toBeNull();
  });

  it("evidência resolve a ação via mapa deliverable→action", () => {
    const map = new Map([["d1", "a9"]]);
    expect(
      mapEvidenceResult(
        { id: "e1", deliverable_id: "d1", title: "Foto", description: null, file_name: "f.pdf" },
        map,
      ),
    ).toEqual({
      id: "e1",
      group: "evidences",
      title: "Foto",
      subtitle: "f.pdf",
      target: { route: "/actions/$actionId", actionId: "a9" },
    });
  });

  it("evidência sem mapa fica sem link", () => {
    expect(
      mapEvidenceResult({
        id: "e1",
        deliverable_id: "d1",
        title: "Foto",
        description: null,
        file_name: null,
      }).target,
    ).toBeNull();
  });

  it("trunca descrições longas no subtítulo", () => {
    const item = mapActionResult({
      id: "a1",
      title: "T",
      description: "x".repeat(300),
      origin: null,
      action_type: null,
      status: null,
    });
    expect(item.subtitle).toHaveLength(140);
    expect(item.subtitle?.endsWith("…")).toBe(true);
  });
});

describe("agrupamento", () => {
  const group = (key: SearchGroupResult["key"], n: number): SearchGroupResult => ({
    key,
    label: groupLabel(key),
    items: Array.from({ length: n }, (_, i) => ({
      id: `${key}-${i}`,
      group: key,
      title: "t",
      subtitle: null,
      target: null,
    })),
    failed: false,
  });

  it("ordena na ordem canônica de exibição", () => {
    const sorted = sortGroups([
      group("vessels", 1),
      group("actions", 1),
      group("evidences", 1),
      group("clients", 1),
      group("deliverables", 1),
    ]);
    expect(sorted.map((g) => g.key)).toEqual([...SEARCH_GROUP_ORDER]);
  });

  it("soma o total de resultados", () => {
    expect(totalResults([group("actions", 3), group("clients", 2)])).toBe(5);
  });

  it("usa limite por grupo", () => {
    expect(GROUP_LIMIT).toBe(10);
  });
});

describe("isSearchable (regressão US-007)", () => {
  it("rejeita termos abaixo do mínimo", () => {
    expect(isSearchable("a")).toBe(false);
    expect(isSearchable("   ")).toBe(false);
  });

  it("rejeita termos que virariam o padrão vazio %% após o escaping", () => {
    expect(isQueryTooShort("(,)")).toBe(false);
    expect(escapeLikeTerm("(,)")).toBe("");
    expect(isSearchable("(,)")).toBe(false);
    expect(isSearchable(", ,")).toBe(false);
  });

  it("aceita termos válidos, inclusive com caracteres especiais", () => {
    expect(isSearchable("dp")).toBe(true);
    expect(isSearchable("100%")).toBe(true);
    expect(isSearchable("ROV (classe 2)")).toBe(true);
  });

  it("mantém o filtro or seguro para termos com caracteres especiais", () => {
    const filter = buildOrFilter(["title", "description"], "  ROV, (classe_2) 100%  ");
    expect(filter).toBe(
      "title.ilike.%ROV classe\\_2 100\\%%,description.ilike.%ROV classe\\_2 100\\%%",
    );
    expect(filter.split(",").length).toBe(2);
  });
});
