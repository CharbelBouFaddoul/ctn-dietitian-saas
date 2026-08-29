declare module "./vendor/html2canvas.min.js" {
  function html2canvas(
    element: HTMLElement,
    options?: {
      scale?: number;
      backgroundColor?: string | null;
      useCORS?: boolean;
      logging?: boolean;
      windowWidth?: number;
    },
  ): Promise<HTMLCanvasElement>;
  export default html2canvas;
}
