import logging

class Logger:
    def __init__(self, name, set_level = logging.INFO):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(set_level)
        self.formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')

    def get_logger(self):
        return self.logger