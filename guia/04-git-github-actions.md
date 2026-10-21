# 04 — Git y GitHub Actions
## Control de versiones y CI/CD

---

## 🌱 1. Git desde cero (configuración inicial — una sola vez)

```bash
# Identidad (usa el mismo email de tu cuenta GitHub)
git config --global user.name "Fermin Gonzalez"
git config --global user.email "tu-email@ejemplo.com"

# Editor por defecto (opcional)
git config --global core.editor "code --wait"
```

---

## 📦 2. Ciclo diario de Git (el flujo completo)

```bash
# 1. Clonar un repo existente
git clone https://github.com/FerminGonzalez/sre-copilot.git
cd sre-copilot

# 2. Crear rama para tu feature (NUNCA trabajes directo en main)
git checkout -b feature/api-errores       # moderno: git switch -c feature/api-errores

# 3. Ver el estado (tu mejor amigo)
git status

# 4. Preparar cambios (staging)
git add .                                  # todo
git add infrastructure/main.tf             # un archivo
git add -p                                 # interactivo (por partes)

# 5. Confirmar
git commit -m "Paso 2: infraestructura base con Terraform"

# 6. Corregir el ÚLTIMO commit (mensaje o archivos olvidados)
git commit --amend -m "mensaje corregido"
git add archivo-olvidado.txt && git commit --amend --no-edit

# 7. Enviar al remoto
git push -u origin feature/api-errores     # primera vez de la rama
git push                                   # siguientes veces

# 8. Actualizar tu rama con los cambios de main
git checkout main && git pull
git checkout feature/api-errores
git merge main
# o mejor: git rebase main (historial más limpio)
```

---

## 🔀 3. Ramas y merge (cuando hay conflictos)

```bash
# Ver ramas
git branch              # locales
git branch -r           # remotas
git branch -a           # todas

# Cambiar de rama
git checkout main
git switch main         # moderno

# Fusionar una rama a main
git checkout main
git merge feature/api-errores

# CONFLICTO típico: git marca el archivo así:
#   <<<<<<< HEAD
#   código de main
#   =======
#   código de tu rama
#   >>>>>>> feature/api-errores
# → Edita el archivo, deja solo el código correcto, luego:
git add archivo-conflictivo.js
git commit -m "Resuelve conflicto de merge"

# Ver historial bonito
git log --oneline --graph --decorate --all

# Deshacer cambios (¡en orden de menor a mayor peligro!)
git restore archivo.txt              # deshacer cambios SIN commitear
git restore --staged archivo.txt     # sacar del staging (queda sin commitear)
git reset --soft HEAD~1              # deshace el último commit, mantiene cambios
git reset --hard HEAD~1              # ⚠️ deshace commit Y cambios (irrecuperable sin backup)
```

---

## 🚀 4. GitHub Actions (CI/CD — el pipeline del proyecto)

### Estructura del workflow (`.github/workflows/deploy.yml`)

```yaml
name: Deploy SRE Copilot

on:
  push:
    branches: [main]              # se dispara al hacer push a main
  workflow_dispatch:              # botón manual en GitHub

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4          # 1. Traer el código

      - uses: actions/setup-node@v4        # 2. Preparar Node
        with:
          node-version: 20

      - run: npm ci && npm test            # 3. Probar

      - uses: azure/webapps-deploy@v3      # 4. Desplegar
        with:
          app-name: app-srecopilot-api-dev
          publish-profile: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Registrar deploy en App Insights   # 5. CustomEvent para el Copilot
        run: |
          curl -X POST "$APPINSIGHTS_URL/v2/track" \
            -H "Content-Type: application/json" \
            -d '{
              "name": "Deploy",
              "time": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
              "iKey": "'$APPINSIGHTS_KEY'",
              "data": {
                "baseType": "EventData",
                "baseData": {
                  "name": "Deploy",
                  "properties": {
                    "commitSha": "${{ github.sha }}",
                    "version": "${{ github.run_number }}"
                  }
                }
              }
            }'
```

### Comandos relacionados con el pipeline

```bash
# Secrets que debes configurar en GitHub (Settings → Secrets and variables → Actions):
#   AZURE_CREDENTIALS     → credenciales de service principal para el deploy
#   APPINSIGHTS_KEY       → instrumentation key
#   APPINSIGHTS_URL       → https://dc.services.visualstudio.com

# Crear el service principal que GitHub usará para desplegar
az ad sp create-for-rbac --name "github-actions-srecopilot" \
  --role contributor \
  --scopes /subscriptions/<sub-id>/resourceGroups/rg-srecopilot-dev \
  --sdk-auth
# → Copia TODO el JSON que devuelve como secret AZURE_CREDENTIALS en GitHub

# Ver el estado de los workflows
gh run list                          # requiere GitHub CLI
gh run view <run-id> --log           # ver logs de una ejecución
```

---

## 📋 Tabla rápida: ¿qué comando uso para...?

| Situación | Comando |
|---|---|
| Empezar algo nuevo | `git checkout -b feature/nombre` |
| Ver qué cambié | `git status` + `git diff` |
| Guardar mi trabajo | `git add . && git commit -m "..."` |
| Subir a GitHub | `git push` |
| Traer cambios del equipo | `git pull` |
| Arreglar el último commit | `git commit --amend` |
| Fusionar mi rama | `git checkout main && git merge mi-rama` |
| Ver historial | `git log --oneline --graph --all` |
| ¡La regué! Volver atrás | `git reset --soft HEAD~1` |
