import decky


class Plugin:
    # All logic lives in the frontend; the backend only logs its lifecycle.
    async def _main(self):
        decky.logger.info("Download All loaded")

    async def _unload(self):
        decky.logger.info("Download All unloaded")
