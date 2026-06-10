import { useState, useRef, useEffect } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import "./App.css";
import Updater, { CheckUpdatesHandle } from "./components/Updater";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
  const [appVersion, setAppVersion] = useState("v0.0.0");
  const updaterRef = useRef<CheckUpdatesHandle>(null);

  useEffect(() => {
    const fetchVersion = async () => {
      const version = await getVersion();
      setAppVersion(`v${version}`);
    };
    fetchVersion();
  }, []);

  async function greet() {
    setGreetMsg(await invoke("greet", { name }));
  }

  const handleForceUpdateCheck = () => {
    updaterRef.current?.checkForUpdates();
  };

  return (
    <main className="container">
      <Updater ref={updaterRef} />

      <h1>version 0.1.23</h1>

      <div className="row">
        <a href="https://vite.dev" target="_blank">
          <img src="/vite.svg" className="logo vite" alt="Vite logo" />
        </a>

        <a href="https://tauri.app" target="_blank">
          <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
        </a>

        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>

      <p>Click on the Tauri, Vite, and React logos to learn more.</p>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />

        <button type="submit">Greet</button>
      </form>

      <p>{greetMsg}</p>

      <button onClick={handleForceUpdateCheck}>
       {appVersion}
      </button>
    </main>
  );
}

export default App;