# Graphive

Graphive is a powerful and intuitive web application designed for visualizing and managing tree structures. Use this tool to easily create, edit, and explore complex hierarchical relationships.

This project specifically focuses on providing a clear and efficient **tree structure display**, making it ideal for visualizing organizational charts, file systems, category hierarchies, and other directed acyclic graphs.

## Key Features

- **Interactive Tree Visualization**: Seamlessly navigate and manipulate tree data using a responsive canvas.
- **Dynamic Layout**: Automatically arranges nodes in a clean, hierarchical tree structure using Dagre layout.
- **Neo4j Integration**: Persistent storage and retrieval of graph data powered by Neo4j.
- **Unified Controls**: Easy-to-use toolbar and settings for managing node creation, selection, and canvas properties.

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- Neo4j Database instance

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository_url>
    cd graphive
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure Neo4j:
    - Ensure your Neo4j instance is running.
    - Connect via the application interface or configure your connection settings.

### Running the Application

To start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

### Building for Production

To create a production build:

```bash
npm run build
```

The output will be in the `dist` directory.
