import { graphSimulation, type GraphNode } from "./portfolioGraphLayout";

export class PortfolioGraph extends HTMLElement {
  #disconnect?: () => void;

  connectedCallback() {
    const svg = this.querySelector("svg.graph");
    const controls = this.querySelector<HTMLElement>(".graph-controls");
    if (!(svg instanceof SVGSVGElement) || !controls) return;

    const controller = new AbortController();
    const { signal } = controller;
    const root = this.dataset.root;
    const elements = Array.from(
      svg.querySelectorAll<SVGGElement>("g[data-node]"),
    );
    const nodes: (GraphNode & { x: number; y: number })[] = elements.map(
      (element) => ({
        id: element.dataset.node!,
        hop: Number(element.dataset.hop),
        x: Number(element.dataset.x),
        y: Number(element.dataset.y),
      }),
    );
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const edgeElements = Array.from(
      svg.querySelectorAll<SVGLineElement>("line[data-source]"),
    );
    const links = edgeElements.map((edge) => ({
      source: byId.get(edge.dataset.source!)!,
      target: byId.get(edge.dataset.target!)!,
    }));
    const simulation = graphSimulation(nodes, links, Boolean(root));
    const activeRoot = root ? byId.get(root) : undefined;
    if (activeRoot) {
      activeRoot.fx = activeRoot.x;
      activeRoot.fy = activeRoot.y;
    }

    const { x, y, width, height } = svg.viewBox.baseVal;
    const initialView = { x, y, width, height };
    const initialViewBox = svg.getAttribute("viewBox")!;
    let view = { ...initialView };
    let gesture:
      | {
          pointerId: number;
          start: DOMPoint;
          screenX: number;
          screenY: number;
          inverse: DOMMatrix;
          view: typeof view;
          node?: GraphNode;
          nodeX: number;
          nodeY: number;
          moved: boolean;
        }
      | undefined;
    let dragged = false;

    const render = () => {
      nodes.forEach((node, i) => {
        elements[i].setAttribute("transform", `translate(${node.x} ${node.y})`);
      });
      links.forEach(({ source, target }, i) => {
        const line = edgeElements[i];
        line.setAttribute("x1", String(source.x));
        line.setAttribute("y1", String(source.y));
        line.setAttribute("x2", String(target.x));
        line.setAttribute("y2", String(target.y));
      });
    };
    const renderView = () => {
      svg.setAttribute(
        "viewBox",
        `${view.x} ${view.y} ${view.width} ${view.height}`,
      );
    };
    const zoom = (factor: number, point: DOMPoint) => {
      const nextWidth = Math.min(
        width * 2,
        Math.max(width / 4, view.width * factor),
      );
      const ratio = nextWidth / view.width;
      view = {
        x: point.x - (point.x - view.x) * ratio,
        y: point.y - (point.y - view.y) * ratio,
        width: nextWidth,
        height: view.height * ratio,
      };
      renderView();
    };
    simulation.on("tick", render);

    svg.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0 || gesture) return;
        const inverse = svg.getScreenCTM()?.inverse();
        if (!inverse) return;
        dragged = false;
        const element =
          event.target instanceof Element
            ? event.target.closest("g[data-node]")
            : null;
        const node = element
          ? byId.get(element.getAttribute("data-node")!)
          : undefined;
        gesture = {
          pointerId: event.pointerId,
          start: new DOMPoint(event.clientX, event.clientY).matrixTransform(
            inverse,
          ),
          screenX: event.clientX,
          screenY: event.clientY,
          inverse,
          view: { ...view },
          node,
          nodeX: node?.x ?? 0,
          nodeY: node?.y ?? 0,
          moved: false,
        };
      },
      { signal },
    );

    svg.addEventListener(
      "pointermove",
      (event) => {
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        if (!gesture.moved) {
          if (
            Math.hypot(
              event.clientX - gesture.screenX,
              event.clientY - gesture.screenY,
            ) < 5
          )
            return;
          gesture.moved = true;
          dragged = true;
          svg.setPointerCapture(event.pointerId);
          this.toggleAttribute("data-dragging", true);
          if (gesture.node) simulation.alphaTarget(0.24).restart();
        }
        const point = new DOMPoint(
          event.clientX,
          event.clientY,
        ).matrixTransform(gesture.inverse);
        const dx = point.x - gesture.start.x;
        const dy = point.y - gesture.start.y;
        if (gesture.node) {
          gesture.node.fx = gesture.nodeX + dx;
          gesture.node.fy = gesture.nodeY + dy;
        } else {
          view.x = gesture.view.x - dx;
          view.y = gesture.view.y - dy;
          renderView();
        }
      },
      { signal },
    );

    const end = (event: PointerEvent) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const { node, moved } = gesture;
      gesture = undefined;
      this.removeAttribute("data-dragging");
      if (node && moved) {
        if (node !== activeRoot) {
          node.fx = null;
          node.fy = null;
        }
        simulation.alphaTarget(0);
      }
    };
    svg.addEventListener("pointerup", end, { signal });
    svg.addEventListener("pointercancel", end, { signal });
    svg.addEventListener(
      "lostpointercapture",
      (event) => {
        if (event.target === svg) end(event);
      },
      { signal },
    );
    svg.addEventListener(
      "pointerleave",
      (event) => {
        if (!gesture?.moved) end(event);
      },
      { signal },
    );
    svg.addEventListener(
      "click",
      (event) => {
        if (!dragged || event.detail === 0) return;
        event.preventDefault();
        event.stopPropagation();
        dragged = false;
      },
      { signal, capture: true },
    );
    svg.addEventListener(
      "wheel",
      (event) => {
        if ((!event.ctrlKey && !event.metaKey) || gesture) return;
        const inverse = svg.getScreenCTM()?.inverse();
        if (!inverse) return;
        event.preventDefault();
        zoom(
          event.deltaY < 0 ? 0.9 : 1.1,
          new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse),
        );
      },
      { signal, passive: false },
    );

    controls.addEventListener(
      "click",
      (event) => {
        if (!(event.target instanceof HTMLButtonElement) || gesture) return;
        const action = event.target.dataset.zoom;
        if (action === "reset") {
          simulation.stop().alphaTarget(0).alpha(1);
          nodes.forEach((node, i) => {
            node.x = Number(elements[i].dataset.x);
            node.y = Number(elements[i].dataset.y);
            node.vx = node.vy = 0;
            node.fx = node === activeRoot ? node.x : null;
            node.fy = node === activeRoot ? node.y : null;
          });
          view = { ...initialView };
          svg.setAttribute("viewBox", initialViewBox);
          render();
        } else if (action === "in" || action === "out") {
          zoom(
            action === "in" ? 0.8 : 1.25,
            new DOMPoint(view.x + view.width / 2, view.y + view.height / 2),
          );
        }
      },
      { signal },
    );

    controls.hidden = false;
    this.setAttribute("data-interactive", "");
    this.#disconnect = () => {
      controller.abort();
      simulation.stop();
      this.removeAttribute("data-dragging");
    };
  }

  disconnectedCallback() {
    this.#disconnect?.();
  }
}
