import { createElement } from "lwc";
import HelloWorld from "c/helloWorld";

describe("c-hello-world", () => {
  afterEach(() => {
    // The jsdom instance is shared across test cases in a single file so reset the DOM
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders greeting with default message", () => {
    const element = createElement("c-hello-world", {
      is: HelloWorld
    });
    document.body.appendChild(element);

    const greetingEl = element.shadowRoot.querySelector(".greeting-text");
    expect(greetingEl.textContent).toBe("Hello, World!");
  });

  it("renders custom greeting when property is set", () => {
    const element = createElement("c-hello-world", {
      is: HelloWorld
    });
    element.greeting = "Salesforce DX";
    document.body.appendChild(element);

    const greetingEl = element.shadowRoot.querySelector(".greeting-text");
    expect(greetingEl.textContent).toBe("Hello, Salesforce DX!");
  });
});
