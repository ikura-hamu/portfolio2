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
    const initialZoom = Math.min(
      4,
      Math.max(0.5, Number(this.dataset.initialZoom) || 1),
    );
    const initialWidth = width / initialZoom;
    const initialHeight = height / initialZoom;
    const initialView = {
      x: x + (width - initialWidth) / 2,
      y: y + (height - initialHeight) / 2,
      width: initialWidth,
      height: initialHeight,
    };
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
    let pinch:
      | {
          view: typeof view;
          inverse: DOMMatrix;
          anchor: DOMPoint;
          distance: number;
        }
      | undefined;

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
    const zoom = (
      from: typeof view,
      factor: number,
      anchor: DOMPoint,
      center = anchor,
    ) => {
      const nextWidth = Math.min(
        width * 2,
        Math.max(width / 4, from.width * factor),
      );
      const ratio = nextWidth / from.width;
      view = {
        x: anchor.x - (center.x - from.x) * ratio,
        y: anchor.y - (center.y - from.y) * ratio,
        width: nextWidth,
        height: from.height * ratio,
      };
      renderView();
    };
    simulation.on("tick", render);

    const startDrag = (
      id: number,
      x: number,
      y: number,
      target: EventTarget | null,
    ) => {
      const inverse = svg.getScreenCTM()?.inverse();
      if (!inverse) return;
      const element =
        target instanceof Element ? target.closest("g[data-node]") : null;
      const node = element
        ? byId.get(element.getAttribute("data-node")!)
        : undefined;
      gesture = {
        pointerId: id,
        start: new DOMPoint(x, y).matrixTransform(inverse),
        screenX: x,
        screenY: y,
        inverse,
        view: { ...view },
        node,
        nodeX: node?.x ?? 0,
        nodeY: node?.y ?? 0,
        moved: false,
      };
    };

    const moveDrag = (x: number, y: number, capture?: () => void) => {
      if (!gesture) return;
      if (!gesture.moved) {
        if (Math.hypot(x - gesture.screenX, y - gesture.screenY) < 5) return;
        gesture.moved = true;
        dragged = true;
        capture?.();
        this.setAttribute("data-dragging", "");
        if (gesture.node) simulation.alphaTarget(0.24).restart();
      }
      const point = new DOMPoint(x, y).matrixTransform(gesture.inverse);
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
    };

    const endDrag = () => {
      if (!gesture) return;
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

    svg.addEventListener(
      "pointerdown",
      (event) => {
        if (
          event.pointerType === "touch" ||
          event.button !== 0 ||
          gesture ||
          pinch
        )
          return;
        dragged = false;
        startDrag(event.pointerId, event.clientX, event.clientY, event.target);
      },
      { signal },
    );
    svg.addEventListener(
      "pointermove",
      (event) => {
        if (
          event.pointerType === "touch" ||
          gesture?.pointerId !== event.pointerId
        )
          return;
        moveDrag(event.clientX, event.clientY, () =>
          svg.setPointerCapture(event.pointerId),
        );
      },
      { signal },
    );
    const endPointer = (event: PointerEvent) => {
      if (
        event.pointerType !== "touch" &&
        gesture?.pointerId === event.pointerId
      )
        endDrag();
    };
    svg.addEventListener("pointerup", endPointer, { signal });
    svg.addEventListener("pointercancel", endPointer, { signal });
    svg.addEventListener("lostpointercapture", endPointer, { signal });
    svg.addEventListener(
      "pointerleave",
      (event) => {
        if (!gesture?.moved) endPointer(event);
      },
      { signal },
    );

    // Handle touch explicitly: relying on pointer capture inside an SVG
    // foreignObject can leave scrolling and zooming to the browser.
    const graphTouches = (event: TouchEvent) =>
      Array.from(event.touches).filter(
        ({ target }) => target instanceof Node && svg.contains(target),
      );
    const touchGeometry = (a: Touch, b: Touch) => ({
      center: new DOMPoint(
        (a.clientX + b.clientX) / 2,
        (a.clientY + b.clientY) / 2,
      ),
      distance: Math.max(
        1,
        Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      ),
    });
    const startPinch = (a: Touch, b: Touch) => {
      const inverse = svg.getScreenCTM()?.inverse();
      if (!inverse) return;
      const { center, distance } = touchGeometry(a, b);
      endDrag();
      dragged = true;
      pinch = {
        view: { ...view },
        inverse,
        anchor: center.matrixTransform(inverse),
        distance,
      };
    };

    svg.addEventListener(
      "touchstart",
      (event) => {
        const [first, second] = graphTouches(event);
        if (second) {
          event.preventDefault();
          if (!pinch) startPinch(first, second);
        } else if (first && !gesture) {
          dragged = false;
          startDrag(
            first.identifier,
            first.clientX,
            first.clientY,
            first.target,
          );
        }
      },
      { signal, passive: false },
    );

    svg.addEventListener(
      "touchmove",
      (event) => {
        const [first, second] = graphTouches(event);
        if (!first) return;
        event.preventDefault();
        if (second && pinch) {
          const { center, distance } = touchGeometry(first, second);
          zoom(
            pinch.view,
            pinch.distance / distance,
            pinch.anchor,
            center.matrixTransform(pinch.inverse),
          );
        } else if (gesture?.pointerId === first.identifier) {
          moveDrag(first.clientX, first.clientY);
        }
      },
      { signal, passive: false },
    );

    const endTouch = (event: TouchEvent) => {
      const [first, second] = graphTouches(event);
      if (pinch) {
        pinch = undefined;
        if (second) startPinch(first, second);
        else if (first)
          startDrag(first.identifier, first.clientX, first.clientY, null);
      } else if (!first) {
        endDrag();
      }
    };
    svg.addEventListener("touchend", endTouch, { signal });
    svg.addEventListener("touchcancel", endTouch, { signal });
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
        if ((!event.ctrlKey && !event.metaKey) || gesture || pinch) return;
        const inverse = svg.getScreenCTM()?.inverse();
        if (!inverse) return;
        event.preventDefault();
        zoom(
          view,
          event.deltaY < 0 ? 0.9 : 1.1,
          new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse),
        );
      },
      { signal, passive: false },
    );

    controls.addEventListener(
      "click",
      (event) => {
        if (!(event.target instanceof HTMLButtonElement) || gesture || pinch)
          return;
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
          renderView();
          render();
        } else if (action === "in" || action === "out") {
          zoom(
            view,
            action === "in" ? 0.8 : 1.25,
            new DOMPoint(view.x + view.width / 2, view.y + view.height / 2),
          );
        }
      },
      { signal },
    );

    if (initialZoom !== 1) renderView();
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
