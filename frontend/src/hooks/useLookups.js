import { useQuery } from "@tanstack/react-query";

import { listCategories, listCities, listDepartments } from "../api/lookupsApi";

// Reference data that rarely changes: cached for the whole session.
const LONG = { staleTime: Infinity, gcTime: Infinity };

/** { byId: { [id]: "Engineering" }, list } */
export function useDepartments() {
  const query = useQuery({ queryKey: ["lookups", "departments"], queryFn: listDepartments, ...LONG });
  const list = query.data ?? [];
  return { list, byId: Object.fromEntries(list.map((d) => [d.id, d.name])) };
}

/** { byId: { [id]: { name, tier } }, list } */
export function useCities() {
  const query = useQuery({ queryKey: ["lookups", "cities"], queryFn: listCities, ...LONG });
  const list = query.data ?? [];
  return { list, byId: Object.fromEntries(list.map((c) => [c.id, c])) };
}

/** { byCode: { MEALS: "Meals" }, list } */
export function useCategories() {
  const query = useQuery({ queryKey: ["lookups", "categories"], queryFn: listCategories, ...LONG });
  const list = query.data ?? [];
  return { list, byCode: Object.fromEntries(list.map((c) => [c.code, c.name])) };
}
