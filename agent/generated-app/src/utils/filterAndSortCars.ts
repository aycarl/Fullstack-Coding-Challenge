import type { Car } from "@/types";

/**
 * The fields the gallery can be ordered by.
 */
export type SortBy = "year" | "make";

/**
 * Filters cars by a case-insensitive substring match on `model` and returns a
 * new array sorted by the requested field.
 *
 * - `search` is trimmed of nothing and compared case-insensitively; an empty
 *   string keeps every car.
 * - `sortBy: 'year'` orders ascending by the numeric year.
 * - `sortBy: 'make'` orders alphabetically by make.
 *
 * The input array and the car objects it holds are never mutated.
 */
export function filterAndSortCars(
  cars: Car[],
  search: string,
  sortBy: SortBy
): Car[] {
  const needle = search.toLowerCase();

  const filtered =
    needle === ""
      ? [...cars]
      : cars.filter((car) => car.model.toLowerCase().includes(needle));

  return filtered.sort((a, b) => {
    if (sortBy === "year") {
      return a.year - b.year;
    }
    return a.make.localeCompare(b.make);
  });
}

export default filterAndSortCars;