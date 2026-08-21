import { FilterX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACTION_PRIORITIES,
  ACTION_PRIORITY_LABELS,
  ACTION_STATUSES,
  ACTION_STATUS_LABELS,
  type ActionPriority,
  type ActionStatus,
} from "@/lib/actions";
import {
  DUE_WINDOWS,
  DUE_WINDOW_LABELS,
  activeFilterCount,
  type DashboardFilterOptions,
  type DashboardFilters,
  type DueWindow,
  type FilterOption,
} from "@/lib/dashboard";

/** Sentinela do shadcn/Select: valores vazios não são permitidos. */
const ANY = "__any__";

function FilterSelect({
  id,
  label,
  value,
  placeholder,
  options,
  onChange,
  emptyHint,
}: {
  id: string;
  label: string;
  value: string | null;
  placeholder: string;
  options: FilterOption[];
  onChange: (value: string | null) => void;
  emptyHint?: string;
}) {
  const disabled = options.length === 0;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? ANY}
        onValueChange={(next) => onChange(next === ANY ? null : next)}
        disabled={disabled}
      >
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {disabled && emptyHint ? (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      ) : null}
    </div>
  );
}

export function DashboardFiltersCard({
  filters,
  options,
  onChange,
  onClear,
}: {
  filters: DashboardFilters;
  options: DashboardFilterOptions;
  onChange: (filters: DashboardFilters) => void;
  onClear: () => void;
}) {
  const count = activeFilterCount(filters);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            Filtros gerenciais
            {count > 0 ? (
              <Badge variant="secondary" aria-label={`${count} filtros ativos`}>
                {count} ativo{count > 1 ? "s" : ""}
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            Aplicados a KPIs, distribuições, rankings e atenção imediata, sobre os dados já
            carregados da sua organização.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onClear} disabled={count === 0}>
          <FilterX className="mr-2 h-4 w-4" aria-hidden="true" />
          Limpar filtros
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FilterSelect
            id="filter-client"
            label="Cliente"
            placeholder="Todos os clientes"
            value={filters.clientId}
            options={options.clients}
            onChange={(clientId) => onChange({ ...filters, clientId })}
            emptyHint="Nenhum cliente vinculado às ações carregadas."
          />
          <FilterSelect
            id="filter-vessel"
            label="Embarcação"
            placeholder="Todas as embarcações"
            value={filters.vesselId}
            options={options.vessels}
            onChange={(vesselId) => onChange({ ...filters, vesselId })}
            emptyHint="Nenhuma embarcação vinculada às ações carregadas."
          />
          <FilterSelect
            id="filter-responsible"
            label="Responsável"
            placeholder="Todos os responsáveis"
            value={filters.responsibleUserId}
            options={options.responsibles}
            onChange={(responsibleUserId) => onChange({ ...filters, responsibleUserId })}
            emptyHint="Nenhum responsável nas ações carregadas."
          />
          <FilterSelect
            id="filter-status"
            label="Status"
            placeholder="Todos os status"
            value={filters.status}
            options={ACTION_STATUSES.map((status) => ({
              value: status,
              label: ACTION_STATUS_LABELS[status],
            }))}
            onChange={(status) => onChange({ ...filters, status: (status as ActionStatus) ?? null })}
          />
          <FilterSelect
            id="filter-priority"
            label="Prioridade"
            placeholder="Todas as prioridades"
            value={filters.priority}
            options={ACTION_PRIORITIES.map((priority) => ({
              value: priority,
              label: ACTION_PRIORITY_LABELS[priority],
            }))}
            onChange={(priority) =>
              onChange({ ...filters, priority: (priority as ActionPriority) ?? null })
            }
          />
          <div className="grid gap-1.5">
            <Label htmlFor="filter-due">Janela de prazo</Label>
            <Select
              value={filters.dueWindow}
              onValueChange={(dueWindow) =>
                onChange({ ...filters, dueWindow: dueWindow as DueWindow })
              }
            >
              <SelectTrigger id="filter-due" aria-label="Janela de prazo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DUE_WINDOWS.map((window) => (
                  <SelectItem key={window} value={window}>
                    {DUE_WINDOW_LABELS[window]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
