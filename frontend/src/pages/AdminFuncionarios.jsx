import { useEffect, useState } from "react";
import { PageShell } from "../components/PageShell";
import { apiFetch } from "../lib/api";
import "./AdminFuncionarios.css";

export function AdminFuncionarios() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showNewEmployeeModal, setShowNewEmployeeModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "operator",
    is_active: true,
  });

  const roles = [
    { value: "admin", label: "Administrador", color: "#f44336" },
    { value: "manager", label: "Gerente", color: "#ff9800" },
    { value: "supervisor", label: "Supervisor", color: "#2196f3" },
    { value: "operator", label: "Operador", color: "#4caf50" },
  ];

  // Carregar funcionários
  useEffect(() => {
    const loadEmployees = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch("/users");
        setEmployees(data || []);
      } catch (loadError) {
        setError(loadError.message || "Falha ao carregar funcionários.");
      } finally {
        setLoading(false);
      }
    };
    loadEmployees();
  }, []);

  // Filtrar funcionários
  const filteredEmployees = employees.filter(
    (emp) =>
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Criar novo funcionário
  const handleCreateEmployee = async () => {
    if (!formData.name || !formData.email || !formData.password || !formData.role) {
      setError("Preencha todos os campos obrigatórios (incluindo senha).");
      return;
    }

    try {
      const newEmployee = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        is_active: formData.is_active ? 1 : 0,
        phone: "",
        permissions: formData.role === 'admin' 
          ? ["admin", "logs", "relatorios", "descontos", "estoque", "caixa"]
          : ["caixa", "estoque"]
      };

      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify(newEmployee),
      });

      setSuccessMessage("Funcionário criado com sucesso!");
      setFormData({ name: "", email: "", password: "", role: "operator", is_active: true });
      setShowNewEmployeeModal(false);

      // Recarregar funcionários
      const data = await apiFetch("/users");
      setEmployees(data || []);

      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (createError) {
      setError(createError.message || "Erro ao criar funcionário.");
    }
  };

  // Editar funcionário
  const handleEditEmployee = async () => {
    if (!formData.name || !formData.email || !formData.role) {
      setError("Preencha todos os campos obrigatórios.");
      return;
    }

    try {
      const updatedEmployee = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        is_active: formData.is_active,
      };

      await apiFetch(`/users/${selectedEmployee.id}`, {
        method: "PUT",
        body: JSON.stringify(updatedEmployee),
      });

      setSuccessMessage("Funcionário atualizado com sucesso!");
      setFormData({ name: "", email: "", role: "operator", is_active: true });
      setShowEditModal(false);
      setSelectedEmployee(null);

      // Recarregar funcionários
      const data = await apiFetch("/users");
      setEmployees(data || []);

      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (editError) {
      setError(editError.message || "Erro ao atualizar funcionário.");
    }
  };

  // Deletar funcionário
  const handleDeleteEmployee = async (id) => {
    if (!window.confirm("Tem certeza que deseja deletar este funcionário?")) {
      return;
    }

    try {
      await apiFetch(`/users/${id}`, { method: "DELETE" });

      setSuccessMessage("Funcionário deletado com sucesso!");

      // Recarregar funcionários
      const data = await apiFetch("/users");
      setEmployees(data || []);

      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (deleteError) {
      setError(deleteError.message || "Erro ao deletar funcionário.");
    }
  };

  // Abrir modal de edição
  const openEditModal = (employee) => {
    setSelectedEmployee(employee);
    setFormData({
      name: employee.name,
      email: employee.email,
      role: employee.role,
      is_active: Boolean(employee.is_active),
    });
    setShowEditModal(true);
  };

  // Resetar formulário
  const resetForm = () => {
    setFormData({ name: "", email: "", password: "", role: "operator", is_active: true });
    setError("");
  };

  const getRoleLabel = (role) => {
    return roles.find((r) => r.value === role)?.label || role;
  };

  const getRoleColor = (role) => {
    return roles.find((r) => r.value === role)?.color || "#999";
  };

  return (
    <PageShell
      title="Gerenciamento de Funcionários"
      subtitle="Cadastro, edição e controle de acesso de usuários"
      actions={
        <button
          className="button"
          onClick={() => {
            resetForm();
            setShowNewEmployeeModal(true);
          }}
        >
          Novo Funcionário
        </button>
      }
    >
      <div className="employees-container">
        {/* Mensagens */}
        {error && <div className="error-message">{error}</div>}
        {successMessage && (
          <div className="success-message">{successMessage}</div>
        )}

        {/* Filtro de Busca */}
        <div className="search-section">
          <input
            type="text"
            placeholder="Buscar por nome ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        {/* Tabela de Funcionários */}
        {loading ? (
          <p className="loading">Carregando funcionários...</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Cargo</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length > 0 ? (
                  filteredEmployees.map((employee) => (
                    <tr key={employee.id}>
                      <td>{employee.name}</td>
                      <td>{employee.email}</td>
                      <td>
                        <span
                          className="role-badge"
                          style={{
                            backgroundColor: getRoleColor(employee.role),
                          }}
                        >
                          {getRoleLabel(employee.role)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${employee.is_active ? "active" : "inactive"}`}
                        >
                          {employee.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn-edit"
                            onClick={() => openEditModal(employee)}
                          >
                            Editar
                          </button>
                          <button
                            className="btn-delete"
                            onClick={() => handleDeleteEmployee(employee.id)}
                          >
                            Deletar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="no-data">
                      Nenhum funcionário encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Novo Funcionário */}
      {showNewEmployeeModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowNewEmployeeModal(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Novo Funcionário</h2>

            <div className="form-group">
              <label>Nome Completo *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Digite o nome completo"
              />
            </div>

            <div className="form-group">
              <label>Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="Digite o email"
              />
            </div>

            <div className="form-group">
              <label>Senha *</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                placeholder="Digite a senha (mín. 8 caracteres)"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Cargo *</label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value })
                  }
                >
                  {roles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Status *</label>
                <select
                  value={formData.is_active ? "active" : "inactive"}
                  onChange={(e) =>
                    setFormData({ ...formData, is_active: e.target.value === "active" })
                  }
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-primary" onClick={handleCreateEmployee}>
                Criar Funcionário
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowNewEmployeeModal(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Funcionário */}
      {showEditModal && selectedEmployee && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Editar Funcionário</h2>
            <p className="modal-subtitle">ID: {selectedEmployee.id}</p>

            <div className="form-group">
              <label>Nome Completo *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Digite o nome completo"
              />
            </div>

            <div className="form-group">
              <label>Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="Digite o email"
              />
            </div>

            <div className="form-group">
              <label>Senha (deixe em branco para manter a atual)</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                placeholder="Digite a senha (mín. 8 caracteres)"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Cargo *</label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value })
                  }
                >
                  {roles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Status *</label>
                <select
                  value={formData.is_active ? "active" : "inactive"}
                  onChange={(e) =>
                    setFormData({ ...formData, is_active: e.target.value === "active" })
                  }
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-primary" onClick={handleEditEmployee}>
                Atualizar Funcionário
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowEditModal(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
