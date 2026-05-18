import logging
import sys


class Logger:
    def __init__(self, name, set_level=logging.DEBUG):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(set_level)

        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(set_level)

        self.formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s')

        console_handler.setFormatter(self.formatter)

        if not self.logger.handlers:
            self.logger.addHandler(console_handler)

    def get_logger(self):
        return self.logger
