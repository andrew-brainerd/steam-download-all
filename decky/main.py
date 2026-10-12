import decky


class Plugin:
    async def _main(self):
        decky.logger.info("Download All loaded")

    async def _unload(self):
        decky.logger.info("Download All unloaded")
