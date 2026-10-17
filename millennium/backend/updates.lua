local fs         = require("fs")
local http       = require("http")
local logger     = require("logger")
local millennium = require("millennium")

local PLUGIN_FILE = "dev.brainerd.download-all.star"
local USER_AGENT = "download-all-updater"

local function plugin_path()
    return millennium.steam_path() .. "/millennium/plugins/" .. PLUGIN_FILE
end

local function staged_path()
    return plugin_path() .. ".new"
end

local function get(url, timeout)
    local response, err = http.get(url, { timeout = timeout, user_agent = USER_AGENT })
    if not response or response.status ~= 200 then
        logger:warn("Update request failed for " .. url .. ": " .. tostring(err or (response and response.status)))
        return nil
    end
    return response.body
end

local function to_hex(bytes)
    return (bytes:gsub(".", function(c) return string.format("%02x", c:byte()) end))
end

---@ffi
---Fetch the release manifest text.
---@param url string
---@return string|nil
function fetch_manifest(url)
    return get(url, 15)
end

---@ffi
---Download a new plugin build next to the current one and return its bytes as hex for verification.
---@param url string
---@return string|nil
function stage_update(url)
    local body = get(url, 60)
    if not body then return nil end
    local file = io.open(staged_path(), "wb")
    if not file then
        logger:error("Cannot write " .. staged_path())
        return nil
    end
    file:write(body)
    file:close()
    return to_hex(body)
end

---@ffi
---Replace the installed plugin with the verified staged build.
---@return boolean
function apply_update()
    if not fs.exists(staged_path()) then return false end
    return fs.rename(staged_path(), plugin_path(), false) and true or false
end

---@ffi
---Delete a staged build that failed verification.
---@return boolean
function discard_update()
    if fs.exists(staged_path()) then fs.remove(staged_path()) end
    return true
end
