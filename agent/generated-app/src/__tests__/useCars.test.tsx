import type { ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import type { MockedResponse } from "@apollo/client/testing";
import { describe, it, expect, vi } from "vitest";
import { GET_CARS, ADD_CAR } from "@/graphql/queries";
import { useCars } from "@/hooks/useCars";

// Fixtures deliberately differ from the MSW seed data so assertions can only
// ever match the records this test supplies.
const existingCar = {
  __typename: "Car" as const,
  id: "901",
  make: "Volvo",
  model: "P1800",
  year: 1969,
  color: "Emerald",
  mobile: "https://placehold.co/640x360?text=Volvo+P1800+Mobile",
  tablet: "https://placehold.co/1023x576?text=Volvo+P1800+Tablet",
  desktop: "https://placehold.co/1440x810?text=Volvo+P1800+Desktop",
};

const newCarInput = {
  make: "DeLorean",
  model: "DMC-12",
  year: 1981,
  color: "Stainless",
};

const createdCar = {
  __typename: "Car" as const,
  id: "902",
  ...newCarInput,
  mobile: "https://placehold.co/640x360?text=DeLorean+DMC-12+Mobile",
  tablet: "https://placehold.co/1023x576?text=DeLorean+DMC-12+Tablet",
  desktop: "https://placehold.co/1440x810?text=DeLorean+DMC-12+Desktop",
};

function createWrapper(mocks: readonly MockedResponse[]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MockedProvider mocks={[...mocks]} addTypename={true}>
        {children}
      </MockedProvider>
    );
  };
}

describe("useCars", () => {
  it("reports loading first, then exposes the cars from GetCars", async () => {
    const mocks: MockedResponse[] = [
      {
        request: { query: GET_CARS },
        result: { data: { cars: [existingCar] } },
      },
    ];

    const { result } = renderHook(() => useCars(), {
      wrapper: createWrapper(mocks),
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.cars).toEqual([]);
    expect(result.current.error).toBeUndefined();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeUndefined();
    expect(result.current.cars).toHaveLength(1);
    expect(result.current.cars[0]).toMatchObject({
      id: "901",
      make: "Volvo",
      model: "P1800",
      year: 1969,
      color: "Emerald",
    });
  });

  it("populates error and keeps cars empty when the query fails", async () => {
    const mocks: MockedResponse[] = [
      {
        request: { query: GET_CARS },
        error: new Error("GetCars request failed"),
      },
    ];

    const { result } = renderHook(() => useCars(), {
      wrapper: createWrapper(mocks),
    });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.error).toBeDefined());

    expect(result.current.loading).toBe(false);
    expect(result.current.cars).toEqual([]);
    expect(result.current.error?.message).toContain("GetCars request failed");
  });

  it("fires AddCar with the given variables and surfaces the new car in cars", async () => {
    const addCarResult = vi.fn(() => ({
      data: { addCar: createdCar },
    }));

    const mocks: MockedResponse[] = [
      {
        request: { query: GET_CARS },
        result: { data: { cars: [existingCar] } },
      },
      {
        request: {
          query: ADD_CAR,
          variables: {
            make: newCarInput.make,
            model: newCarInput.model,
            year: newCarInput.year,
            color: newCarInput.color,
          },
        },
        result: addCarResult,
      },
      // Available if the implementation refreshes the list via refetch;
      // unused when the cache is updated directly.
      {
        request: { query: GET_CARS },
        result: { data: { cars: [existingCar, createdCar] } },
      },
    ];

    const { result } = renderHook(() => useCars(), {
      wrapper: createWrapper(mocks),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.cars.map((car) => car.id)).toEqual(["901"]);

    await act(async () => {
      await result.current.addCar(newCarInput);
    });

    expect(addCarResult).toHaveBeenCalledTimes(1);
    expect(addCarResult).toHaveBeenCalledWith(
      expect.objectContaining({
        make: "DeLorean",
        model: "DMC-12",
        year: 1981,
        color: "Stainless",
      })
    );

    // No re-mount: the same hook instance must observe the new car.
    await waitFor(() =>
      expect(
        result.current.cars.some((car) => car.model === "DMC-12")
      ).toBe(true)
    );

    const added = result.current.cars.find((car) => car.model === "DMC-12");
    expect(added).toMatchObject({
      id: "902",
      make: "DeLorean",
      model: "DMC-12",
      year: 1981,
      color: "Stainless",
    });
    expect(result.current.cars.map((car) => car.id)).toEqual(["901", "902"]);
    expect(result.current.adding).toBe(false);
    expect(result.current.error).toBeUndefined();
  });
});