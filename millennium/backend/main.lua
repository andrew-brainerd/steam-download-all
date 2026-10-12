local logger     = require("logger")
local millennium = require("millennium")

local function on_load()
    logger:info("Loaded with Millennium version " .. millennium.version())
    millennium.ready()
end

local function on_unload()
    logger:info("Plugin unloaded")
end

return {
    on_load = on_load,
    on_unload = on_unload,
}
