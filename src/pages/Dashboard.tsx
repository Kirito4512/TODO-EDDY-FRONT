import { useEffect, useMemo, useState } from "react";
import { FiLogOut, FiSearch, FiPlus, FiCheck, FiClock, FiPlay, FiEdit2, FiTrash2, FiSave, FiX, FiCloud, FiCloudOff } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { api, setAuth } from "../api";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { toast } from "react-toastify";

import {
  cacheTasks,
  getAllTasksLocal,
  putTaskLocal,
  removeTaskLocal,
  queue,
  setMapping,
  getMapping,
} from "../offline/db";

type Task = {
  _id: string;
  title: string;
  description?: string;
  status: "Pendiente" | "En Progreso" | "Completada";
  clienteId?: string;
  createdAt?: string;
  deleted?: boolean;
};

function normalizeTask(x: any): Task {
  return {
    _id: String(x?._id ?? x?.id),
    title: String(x?.title ?? "(sin título)"),
    description: x?.description ?? "",
    status:
      x?.status === "Completada" ||
      x?.status === "En Progreso" ||
      x?.status === "Pendiente"
        ? x.status
        : "Pendiente",
    clienteId: x?.clienteId,
    createdAt: x?.createdAt,
    deleted: !!x?.deleted,
  };
}

function isSyncPending(id: string): boolean {
  return id.length > 30;
}

function formatDate(dateString?: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [statusNew, setStatusNew] = useState<Task["status"]>("Pendiente");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDesc, setEditingDesc] = useState("");
  const [editingStatus, setEditingStatus] = useState<Task["status"]>("Pendiente");

  const isOnline = useOnlineStatus();
  const navigate = useNavigate();

  useEffect(() => {
    setAuth(localStorage.getItem("token"));
    loadTasks();

    const handler = () => {
      toast.success("Sincronización completada");
      loadTasks();
    };

    window.addEventListener("sync-complete", handler);

    return () => {
      window.removeEventListener("sync-complete", handler);
    };
  }, []);

  async function loadTasks() {
    setLoading(true);
    try {
      if (navigator.onLine) {
        try {
          const { data } = await api.get("/tasks");

          const raw = Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data)
            ? data
            : [];

          const list = raw.map(normalizeTask);
          setTasks(list);
          await cacheTasks(list);
        } catch (err) {
          console.warn("Server error, loading cache", err);
          toast.error("No se pudo conectar al servidor, usando modo offline");
          const cached = await getAllTasksLocal();
          setTasks(cached);
        }
      } else {
        const cached = await getAllTasksLocal();
        setTasks(cached);
      }
    } finally {
      setLoading(false);
    }
  }

  // ADD TASK
  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;

    const clienteId = crypto.randomUUID();
    const newTask: Task = {
      _id: clienteId,
      title: t,
      description: desc.trim() || "",
      status: statusNew,
      clienteId,
      createdAt: new Date().toISOString(),
    };

    setTasks((prev) => [newTask, ...prev]);
    await putTaskLocal(newTask);

    setTitle("");
    setDesc("");
    setStatusNew("Pendiente");

    toast.success("Tarea creada exitosamente");

    if (navigator.onLine) {
      try {
        const { data } = await api.post("/tasks", {
          title: newTask.title,
          description: newTask.description,
          status: newTask.status,
        });

        const serverTask = normalizeTask(data?.task ?? data);
        const serverId = serverTask._id;

        await setMapping(clienteId, serverId);

        setTasks((prev) => {
          const filtered = prev.filter((x) => x._id !== clienteId);
          return [serverTask, ...filtered];
        });

        await removeTaskLocal(clienteId);
        await putTaskLocal(serverTask);
      } catch (err) {
        await queue({
          _id: crypto.randomUUID(),
          op: "create",
          clienteId,
          data: newTask,
          ts: Date.now(),
        });
      }
    } else {
      await queue({
        _id: crypto.randomUUID(),
        op: "create",
        clienteId,
        data: newTask,
        ts: Date.now(),
      });
    }
  }

  // CHANGE STATUS
  async function changeStatus(task: Task, newStatus: Task["status"]) {
    const updated = { ...task, status: newStatus };

    setTasks((prev) => prev.map((x) => (x._id === task._id ? updated : x)));
    await putTaskLocal(updated);

    toast.success("Estado actualizado");

    const mappingId = await getMapping(task.clienteId ?? "");
    const id = mappingId ?? task._id;

    if (!mappingId && (!id || id === "undefined")) {
      await queue({
        _id: crypto.randomUUID(),
        op: "update",
        clienteId: task.clienteId ?? "",
        data: updated,
        ts: Date.now(),
      });
      return;
    }

    if (navigator.onLine) {
      try {
        await api.put(`/tasks/${id}`, {
          title: updated.title,
          description: updated.description,
          status: updated.status,
        });
      } catch (err) {
        await queue({
          _id: crypto.randomUUID(),
          op: "update",
          clienteId: task.clienteId ?? "",
          data: updated,
          ts: Date.now(),
        });
      }
    } else {
      await queue({
        _id: crypto.randomUUID(),
        op: "update",
        clienteId: task.clienteId ?? "",
        data: updated,
        ts: Date.now(),
      });
    }
  }

  function toggleTask(task: Task) {
    const newStatus =
      task.status === "Completada" ? "Pendiente" : "Completada";
    changeStatus(task, newStatus);
  }

  // START EDIT
  function startEdit(task: Task) {
    setEditingId(task._id);
    setEditingTitle(task.title);
    setEditingDesc(task.description ?? "");
    setEditingStatus(task.status);
  }

  // SAVE EDIT
  async function saveEdit(taskId: string) {
    const t = tasks.find((x) => x._id === taskId);
    if (!t) return;

    const updated: Task = {
      ...t,
      title: editingTitle.trim(),
      description: editingDesc.trim(),
      status: editingStatus,
    };

    setTasks((prev) => prev.map((x) => (x._id === taskId ? updated : x)));
    setEditingId(null);
    await putTaskLocal(updated);

    toast.success("Cambios guardados");

    const mappingId = await getMapping(updated.clienteId ?? "");
    const id = mappingId ?? updated._id;

    if (!mappingId && (!id || id === "undefined")) {
      await queue({
        _id: crypto.randomUUID(),
        op: "update",
        clienteId: updated.clienteId ?? "",
        data: updated,
        ts: Date.now(),
      });
      return;
    }

    if (navigator.onLine) {
      try {
        await api.put(`/tasks/${id}`, {
          title: updated.title,
          description: updated.description,
          status: updated.status,
        });
      } catch (err) {
        await queue({
          _id: crypto.randomUUID(),
          op: "update",
          clienteId: updated.clienteId ?? "",
          data: updated,
          ts: Date.now(),
        });
      }
    } else {
      await queue({
        _id: crypto.randomUUID(),
        op: "update",
        clienteId: updated.clienteId ?? "",
        data: updated,
        ts: Date.now(),
      });
    }
  }

  function cancelEdit() {
    setEditingId(null);
  }

  // REMOVE TASK
  async function removeTask(taskId: string) {
    const task = tasks.find((t) => t._id === taskId);
    setTasks((prev) => prev.filter((x) => x._id !== taskId));
    await removeTaskLocal(taskId);

    toast.success("Tarea eliminada");

    const mappingId = await getMapping(task?.clienteId ?? "");
    const id = mappingId ?? taskId;

    if (!mappingId && (!id || id === "undefined")) {
      await queue({
        _id: crypto.randomUUID(),
        op: "delete",
        clienteId: task?.clienteId ?? "",
        ts: Date.now(),
      });
      return;
    }

    if (navigator.onLine) {
      try {
        await api.delete(`/tasks/${id}`);
      } catch (err) {
        await queue({
          _id: crypto.randomUUID(),
          op: "delete",
          clienteId: task?.clienteId ?? "",
          ts: Date.now(),
        });
      }
    } else {
      await queue({
        _id: crypto.randomUUID(),
        op: "delete",
        clienteId: task?.clienteId ?? "",
        ts: Date.now(),
      });
    }
  }

  function logout() {
    localStorage.removeItem("token");
    setAuth(null);
    navigate("/login", { replace: true });
  }

  const filtered = useMemo(() => {
    let list = tasks;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(s) ||
          (t.description || "").toLowerCase().includes(s)
      );
    }
    if (filter === "active")
      list = list.filter((t) => t.status !== "Completada");
    if (filter === "completed")
      list = list.filter((t) => t.status === "Completada");
    return list;
  }, [tasks, search, filter]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "Completada").length;
    const pending = tasks.filter((t) => t.status === "Pendiente").length;
    const progress = tasks.filter((t) => t.status === "En Progreso").length;
    return { total, done, pending, progress };
  }, [tasks]);

  const getStatusBadgeClass = (status: Task["status"]) => {
    switch (status) {
      case "Pendiente": return "status-pending";
      case "En Progreso": return "status-progress";
      case "Completada": return "status-completed";
      default: return "";
    }
  };

  const getStatusIcon = (status: Task["status"]) => {
    switch (status) {
      case "Pendiente": return <FiClock />;
      case "En Progreso": return <FiPlay />;
      case "Completada": return <FiCheck />;
      default: return null;
    }
  };

  return (
    <div className="wrap">
      {/* Header */}
      <header className="topbar">
        <div className="topbar-container">
          <div className="topbar-left">
            <h1>Dashboard de Tareas</h1>
            <div className="stats">
              <div className="stat-item">
                <span className="stat-value">{stats.total}</span>
                <span className="stat-label">Total</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{stats.pending}</span>
                <span className="stat-label">Pendientes</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{stats.progress}</span>
                <span className="stat-label">En Progreso</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{stats.done}</span>
                <span className="stat-label">Completadas</span>
              </div>
            </div>
          </div>
          
          <div className="topbar-right">
            <div className={`connection-status ${isOnline ? 'online' : 'offline'}`}>
              <div className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
              <span>{isOnline ? 'En línea' : 'Sin conexión'}</span>
            </div>
            <button className="btn btn-danger" onClick={logout}>
              <FiLogOut size={18} />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* Crear nueva tarea */}
        <section className="create-section">
          <div className="form-header">
            <h2><FiPlus /> Nueva Tarea</h2>
          </div>
          <form className="create-form" onSubmit={addTask}>
            <div className="input-group">
              <input
                className="input-field"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título de la tarea..."
                required
              />
            </div>
            
            <div className="input-group">
              <select
                className="input-field select-field"
                value={statusNew}
                onChange={(e) => setStatusNew(e.target.value as Task["status"])}
              >
                <option value="Pendiente">Pendiente</option>
                <option value="En Progreso">En Progreso</option>
                <option value="Completada">Completada</option>
              </select>
            </div>
            
            <div className="input-group">
              <textarea
                className="input-field textarea-field"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Descripción opcional..."
                rows={2}
              />
            </div>
            
            <button className="btn btn-primary" type="submit">
              <FiPlus />
              Agregar
            </button>
          </form>
        </section>

        {/* Controles de búsqueda y filtros */}
        <section className="controls-section">
          <div className="search-container">
            <FiSearch className="search-icon" />
            <input
              className="search-input"
              type="text"
              placeholder="Buscar tareas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="filter-buttons">
            <button
              className={`filter-btn ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
              type="button"
            >
              Todas
            </button>
            <button
              className={`filter-btn ${filter === "active" ? "active" : ""}`}
              onClick={() => setFilter("active")}
              type="button"
            >
              Activas
            </button>
            <button
              className={`filter-btn ${filter === "completed" ? "active" : ""}`}
              onClick={() => setFilter("completed")}
              type="button"
            >
              Completadas
            </button>
          </div>
        </section>

        {/* Lista de tareas */}
        <section className="tasks-section">
          {loading ? (
            <div className="loading">
              <div className="spinner"></div>
              <p>Cargando tareas...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3>No hay tareas</h3>
              <p>{search ? "No se encontraron tareas con tu búsqueda" : "Comienza agregando una nueva tarea"}</p>
            </div>
          ) : (
            <div className="task-list">
              {filtered.map((task, idx) => {
                const isEditing = editingId === task._id;
                const syncPending = isSyncPending(task._id);
                
                return (
                  <div
                    key={task._id}
                    className={`task-item ${task.status === "Completada" ? "done" : ""}`}
                  >
                    <div className="task-header">
                      <div className="task-info">
                        <div className="task-number">{idx + 1}</div>
                        <div className="task-content">
                          {!isEditing ? (
                            <>
                              <h3 className="task-title">{task.title}</h3>
                              {task.description && (
                                <p className="task-description">{task.description}</p>
                              )}
                            </>
                          ) : (
                            <div className="edit-panel">
                              <form className="edit-form" onSubmit={(e) => {
                                e.preventDefault();
                                saveEdit(task._id);
                              }}>
                                <div className="input-group">
                                  <input
                                    className="input-field"
                                    value={editingTitle}
                                    onChange={(e) => setEditingTitle(e.target.value)}
                                    placeholder="Título"
                                    required
                                  />
                                </div>
                                
                                <div className="input-group">
                                  <textarea
                                    className="input-field textarea-field"
                                    value={editingDesc}
                                    onChange={(e) => setEditingDesc(e.target.value)}
                                    placeholder="Descripción"
                                    rows={3}
                                  />
                                </div>
                                
                                <div className="input-group">
                                  <select
                                    className="input-field select-field"
                                    value={editingStatus}
                                    onChange={(e) => setEditingStatus(e.target.value as Task["status"])}
                                  >
                                    <option value="Pendiente">Pendiente</option>
                                    <option value="En Progreso">En Progreso</option>
                                    <option value="Completada">Completada</option>
                                  </select>
                                </div>
                                
                                <div className="edit-actions">
                                  <button className="btn btn-secondary" type="button" onClick={cancelEdit}>
                                    <FiX /> Cancelar
                                  </button>
                                  <button className="btn btn-primary" type="submit">
                                    <FiSave /> Guardar
                                  </button>
                                </div>
                              </form>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {!isEditing && (
                        <div className="task-actions">
                          <div className={`task-status-badge ${getStatusBadgeClass(task.status)}`}>
                            {getStatusIcon(task.status)}
                            <span>{task.status}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {!isEditing && (
                      <div className="task-footer">
                        <div className="task-meta">
                          {task.createdAt && (
                            <div className="task-date">
                              <FiClock size={14} />
                              <span>{formatDate(task.createdAt)}</span>
                            </div>
                          )}
                          {syncPending && (
                            <div className="sync-indicator">
                              <FiCloud />
                              <span>Pendiente sincronizar</span>
                            </div>
                          )}
                          {!isOnline && !syncPending && (
                            <div className="sync-indicator">
                              <FiCloudOff />
                              <span>Modo offline</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="task-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => changeStatus(task, "Pendiente")}
                            type="button"
                          >
                            <FiClock /> Pendiente
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => changeStatus(task, "En Progreso")}
                            type="button"
                          >
                            <FiPlay /> En Progreso
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => changeStatus(task, "Completada")}
                            type="button"
                          >
                            <FiCheck /> Completada
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => startEdit(task)}
                            type="button"
                          >
                            <FiEdit2 /> Editar
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => removeTask(task._id)}
                            type="button"
                          >
                            <FiTrash2 /> Eliminar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}