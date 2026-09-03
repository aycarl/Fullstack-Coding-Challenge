import { describe, it, expect } from "vitest";
import { filterAndSortCars } from "@/utils/filterAndSortCars";
import type { Car } from "@/types";

/**
 * Contract under test:
 *
 *   import { filterAndSortCars } from "@/utils/filterAndSortCars";
 *
 *   filterAndSortCars(cars: Car[], search: string, sortBy: 'year' | 'make'): Car[]
 *
 * - `search` matches against the car's `model` as a case-insensitive substring.
 * - An empty `search` keeps every car.
 * - `sortBy: 'year'` orders ascending by year; `sortBy: 'make'` orders
 *   alphabetically by make.
 * - The input array is never mutated.
 */

function makeCar(overrides: Partial<Car> & Pick<Car, "id" | "make" | "model" | "year">): Car {
  const label = `${overrides.make} ${overrides.model}`;
  return {
    color: "Aubergine",
    mobile: `https://placehold.co/640x360?text=${encodeURIComponent(label)}+Mobile`,
    tablet: `https://placehold.co/1023x576?text=${encodeURIComponent(label)}+Tablet`,
    desktop: `https://placehold.co/1440x810?text=${encodeURIComponent(label)}+Desktop`,
    ...overrides,
  };
}

// Fixtures are deliberately unlike every MSW-seeded record (see src/mocks/data.ts)
// so the assertions below can only ever match the cars this test supplies.
const sonett = makeCar({
  id: "921",
  make: "Saab",
  model: "Sonett",
  year: 1967,
  color: "Marigold",
});

const fulvia = makeCar({
  id: "922",
  make: "Lancia",
  model: "Fulvia",
  year: 1971,
  color: "Chartreuse",
});

const isetta = makeCar({
  id: "923",
  make: "Iso",
  model: "Isetta",
  year: 1955,
  color: "Cerulean",
});

const sonettV4 = makeCar({
  id: "924",
  make: "Zastava",
  model: "sonett-v4",
  year: 1983,
  color: "Ochre",
});

const cars: Car[] = [sonett, fulvia, isetta, sonettV4];

function ids(result: Car[]): string[] {
  return result.map((car) => car.id);
}

describe("filterAndSortCars", () => {
  describe("filtering by model", () => {
    it("keeps only cars whose model contains the search string", () => {
      const result = filterAndSortCars(cars, "Fulvia", "year");

      expect(ids(result)).toEqual(["922"]);
      expect(result[0]).toMatchObject({ make: "Lancia", model: "Fulvia" });
    });

    it("matches the model case-insensitively", () => {
      expect(ids(filterAndSortCars(cars, "fulvia", "year"))).toEqual(["922"]);
      expect(ids(filterAndSortCars(cars, "FULVIA", "year"))).toEqual(["922"]);
      expect(ids(filterAndSortCars(cars, "FuLvIa", "year"))).toEqual(["922"]);
    });

    it("matches on a substring, not only a whole model name", () => {
      // "nett" is a substring of both "Sonett" and "sonett-v4" and of no other
      // fixture model, so it can only ever select those two cars.
      const result = filterAndSortCars(cars, "nett", "year");

      expect(ids(result)).toEqual(["921", "924"]);
    });

    it("returns every car matching the substring regardless of case", () => {
      const result = filterAndSortCars(cars, "SONETT", "year");

      expect(ids(result)).toEqual(["921", "924"]);
    });

    it("leaves out cars whose model does not contain the search string", () => {
      const result = filterAndSortCars(cars, "Isetta", "year");

      expect(ids(result)).toEqual(["923"]);
      expect(result.some((car) => car.model === "Fulvia")).toBe(false);
      expect(result.some((car) => car.model === "Sonett")).toBe(false);
      expect(result.some((car) => car.model === "sonett-v4")).toBe(false);
    });

    it("does not match against make, color or year", () => {
      expect(filterAndSortCars(cars, "Lancia", "year")).toEqual([]);
      expect(filterAndSortCars(cars, "Chartreuse", "year")).toEqual([]);
      expect(filterAndSortCars(cars, "1971", "year")).toEqual([]);
    });

    it("returns an empty array when nothing matches", () => {
      const result = filterAndSortCars(cars, "Countach", "make");

      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns all cars when the search string is empty", () => {
      const result = filterAndSortCars(cars, "", "year");

      expect(result).toHaveLength(cars.length);
      expect(ids(result).sort()).toEqual(["921", "922", "923", "924"]);
    });

    it("returns an empty array when there are no cars to filter", () => {
      expect(filterAndSortCars([], "", "year")).toEqual([]);
      expect(filterAndSortCars([], "Sonett", "make")).toEqual([]);
    });
  });

  describe("sorting", () => {
    it("orders by year ascending when sortBy is 'year'", () => {
      const result = filterAndSortCars(cars, "", "year");

      expect(result.map((car) => car.year)).toEqual([1955, 1967, 1971, 1983]);
      expect(ids(result)).toEqual(["923", "921", "922", "924"]);
    });

    it("orders alphabetically by make when sortBy is 'make'", () => {
      const result = filterAndSortCars(cars, "", "make");

      expect(result.map((car) => car.make)).toEqual([
        "Iso",
        "Lancia",
        "Saab",
        "Zastava",
      ]);
      expect(ids(result)).toEqual(["923", "922", "921", "924"]);
    });

    it("sorts the filtered subset, not the whole list", () => {
      const result = filterAndSortCars(cars, "sonett", "year");

      expect(result.map((car) => car.year)).toEqual([1967, 1983]);
      expect(ids(result)).toEqual(["921", "924"]);
    });

    it("sorts the filtered subset alphabetically by make", () => {
      const result = filterAndSortCars(cars, "sonett", "make");

      expect(result.map((car) => car.make)).toEqual(["Saab", "Zastava"]);
      expect(ids(result)).toEqual(["921", "924"]);
    });

    it("orders by year even when the input is already in a different order", () => {
      const reversed = [...cars].reverse();

      const result = filterAndSortCars(reversed, "", "year");

      expect(result.map((car) => car.year)).toEqual([1955, 1967, 1971, 1983]);
    });

    it("orders by make even when the input is already in a different order", () => {
      const reversed = [...cars].reverse();

      const result = filterAndSortCars(reversed, "", "make");

      expect(result.map((car) => car.make)).toEqual([
        "Iso",
        "Lancia",
        "Saab",
        "Zastava",
      ]);
    });
  });

  describe("purity", () => {
    it("does not mutate the input array when sorting by year", () => {
      const input: Car[] = [...cars];
      const snapshot = [...input];

      filterAndSortCars(input, "", "year");

      expect(input).toEqual(snapshot);
      expect(ids(input)).toEqual(["921", "922", "923", "924"]);
    });

    it("does not mutate the input array when sorting by make", () => {
      const input: Car[] = [...cars];
      const snapshot = [...input];

      filterAndSortCars(input, "", "make");

      expect(input).toEqual(snapshot);
      expect(ids(input)).toEqual(["921", "922", "923", "924"]);
    });

    it("does not mutate the input array when filtering", () => {
      const input: Car[] = [...cars];

      filterAndSortCars(input, "sonett", "make");

      expect(input).toHaveLength(4);
      expect(ids(input)).toEqual(["921", "922", "923", "924"]);
    });

    it("returns a new array instance", () => {
      const input: Car[] = [...cars];

      const result = filterAndSortCars(input, "", "year");

      expect(result).not.toBe(input);
    });

    it("does not mutate the car objects it returns", () => {
      const input: Car[] = [...cars];

      filterAndSortCars(input, "", "make");

      expect(sonett).toMatchObject({
        id: "921",
        make: "Saab",
        model: "Sonett",
        year: 1967,
        color: "Marigold",
      });
      expect(fulvia).toMatchObject({
        id: "922",
        make: "Lancia",
        model: "Fulvia",
        year: 1971,
        color: "Chartreuse",
      });
    });
  });
});
