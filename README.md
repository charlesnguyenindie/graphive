<p align="center">
  <img src="icons/graphive_icon_180x180.png" alt="Graphive Logo" width="120" />
  <h1 align="center">Graphive</h1>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/neo4j-4.x%20|%205.x-008CC1.svg?logo=neo4j&logoColor=white" alt="Neo4j" />
  <img src="https://img.shields.io/badge/react--flow-11.x-ff0072.svg?logo=react&logoColor=white" alt="React Flow" />
  <img src="https://img.shields.io/badge/vite-5.x-646CFF.svg?logo=vite&logoColor=white" alt="Vite" />
  <a href="https://ko-fi.com/charlesnguyen" target="_blank"><img src="https://img.shields.io/badge/Ko--fi-F16061?style=flat&logo=ko-fi&logoColor=white" alt="Support on Ko-fi" /></a>
</p>

<p align="center">
  <strong>The structured, visual editor for Neo4j.</strong>
  <br>
  Built with React Flow to bring clarity to your graph data.
</p>

<br>

## 🖼️ Screenshots

<p align="center">
  <img src="media/screenshot_one.png" alt="Graphive Screenshot 1" width="100%" />
</p>

<p align="center">
  <img src="media/screenshot_two.png" alt="Graphive Screenshot 2" width="100%" />
</p>

<br>

## 🌟 Intuitive Creation, Mindmap Feel

Graphive is designed with a **Miro-like intuition** and a **mindmap-like flow**.

While traditional graph explorers are often complex and read-only, Graphive is a developer's canvas. It focuses on the **ease of creation and connection**, making Neo4j feel as fluid as a digital whiteboarding tool.

*   **⚡ Effortless Interaction**: Display, add, and connect nodes and edges with simple, tactile interactions.
*   **🧠 Mindmap Likeness**: Visualize your graph with the natural feel of a mindmap, keeping your cognitive load low.
*   **🖌️ Miro-like Ease**: A premium, responsive interface that turns data exploration into a creative process.
*   **🏗️ Build, Don't Just Browse**: Seamlessly edit properties and labels on the fly to evolve your graph as you think.

### 🛣️ Roadmap: Force-Directed Layouts
Graphive started as a personal tool for building a **Personal Knowledge Base (PKB)**. Because I prefer a mindmap-style flow for my own research and thinking, I prioritized polished **Hierarchical Views** first. 

**Force-Directed Layouts** (organic views) are officially on the roadmap and will be added as the project evolves!

<br>

## 🛠️ Tech Stack

Built with a modern, performance-first stack:

*   **[React Flow](https://reactflow.dev/)**: The powerful, customizable library powering our node-based UI.
*   **[Neo4j](https://neo4j.com/)**: Connecting directly to the leading graph database via the Bolt driver.
*   **[Vite](https://vitejs.dev/)**: Ensuring a lightning-fast development experience and optimized builds.

<br>

## ✨ Key Features

*   **🏗️ Structured Auto-Layout**: Automatically arranges nodes in clear hierarchies (DAGre/Tree).
*   **💾 Dashboard System**: Create distinct workspaces. Save your exploration state (nodes, positions, query) and restore them instantly.
*   **🖍️ Visual Editing**: Rename nodes, edit properties, delete relationships, and manage labels directly on the canvas.
*   **🔍 Cypher Power**: Run custom Cypher queries and visualize specific subgraphs with one click.
*   **⚡ Auto-Connect**: Seamlessly explore relationships with interactive handles and context menus.



<br>

## 🚀 Quick Start

### Prerequisites
*   Node.js (v18+)
*   Running Neo4j Instance (Desktop or Aura) with Bolt enabled.

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/charlesnguyenindie/graphive.git
    cd graphive
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Run the development server**
    ```bash
    npm run dev
    ```

4.  **Connect & Explore**
    Open `http://localhost:5173` in your browser. Enter your Neo4j connection details (e.g., `bolt://localhost:7687`) and start building your dashboards!

<br>

## 💖 Support & Donation

If you find Graphive helpful and want to support its development, you can buy me a coffee!

<a href="https://ko-fi.com/charlesnguyen" target="_blank"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Buy Me A Coffee" height="36px" /></a>

<br>

## 📬 Contact

Have questions, suggestions, or want to collaborate? Feel free to reach out!

*   **Email**: [charles.nguyen.indie@gmail.com](mailto:charles.nguyen.indie@gmail.com)

<br>

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
