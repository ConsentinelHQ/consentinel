export type FluidHandle = {
  setPaused: (value: boolean) => void;
  stop: () => void;
};

export function startFluid(canvas: HTMLCanvasElement): FluidHandle;
